import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import axios from 'axios';

// 타입 정의
type RiverStation = {
  GU_OFC_NM: string;
  WATG_NM: string;
  RLTM_RVR_WATL_CNT: string;
  PLAN_FLDE: string;
  DTRSM_DATA_CLCT_TM: string;
};

type SelectedDistrict = {
  name: string;
  coordinates: [number, number];
  bounds: [[number, number], [number, number]];
  area: number;
};

type RiverGroupData = {
  riverName: string;
  data: RiverStation[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TopoJsonData = any;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GeoFeatureCollection = any;

function KoreaMap() {
  const [geoData, setGeoData] = useState<TopoJsonData | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<SelectedDistrict | null>(null);
  const [realTimeRiverData, setRealTimeRiverData] = useState<RiverGroupData[] | null>(null);
  const [districtRiskLevels, setDistrictRiskLevels] = useState<{ [key: string]: number }>({});
  const [isLoadingRiskData, setIsLoadingRiskData] = useState(false);

  const [riverDataCache, setRiverDataCache] = useState<{ [key: string]: RiverStation[] }>({});
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const svgRef = useRef<SVGSVGElement>(null);

  // 반응형 지도 크기 설정
  useEffect(() => {
    const updateDimensions = () => {
      const screenWidth = window.innerWidth;
      if (screenWidth < 640) {
        // sm
        setDimensions({ width: Math.min(screenWidth - 32, 400), height: 300 });
      } else if (screenWidth < 768) {
        // md
        setDimensions({ width: Math.min(screenWidth - 64, 500), height: 375 });
      } else if (screenWidth < 1024) {
        // lg
        setDimensions({ width: 600, height: 450 });
      } else {
        setDimensions({ width: 900, height: 700 });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  // 구별 주요 하천 매핑
  const DISTRICT_RIVERS = useMemo(
    () =>
      ({
        강남구: ['탄천'],
        강동구: [],
        강북구: [],
        강서구: ['안양천'],
        관악구: ['도림천'],
        광진구: ['중랑천'],
        구로구: ['안양천', '도림천', '목감천'],
        금천구: ['안양천'],
        노원구: ['우이천', '중랑천'],
        도봉구: ['방학천', '중랑천', '우이천'],
        동대문구: ['중랑천'],
        동작구: ['한강'],
        마포구: ['홍제천'],
        서대문구: ['불광천'],
        서초구: ['탄천'],
        성동구: ['중랑천', '청계천'],
        성북구: [],
        송파구: ['탄천'],
        양천구: ['안양천'],
        영등포구: ['안양천'],
        용산구: ['한강'],
        은평구: ['한강'],
        종로구: ['청계천'],
        중구: ['청계천'],
        중랑구: ['중랑천'],
      } as { [key: string]: string[] }),
    []
  );

  // 위험도에 따른 색상 반환 함수
  const getRiskColor = (riskLevel: number) => {
    if (riskLevel >= 0.95) return '#dc2626'; // 위험
    if (riskLevel >= 0.85) return '#fcd34d'; // 경계
    if (riskLevel >= 0.7) return '#fdba74'; // 주의
    if (riskLevel >= 0.3) return '#40c057'; // 관심
    return '#9ca3af'; // 데이터 없음
  };

  // TopoJSON
  useEffect(() => {
    axios
      .get('/data/korea.json')
      .then((response) => {
        setGeoData(response.data);
        // 지도 로드 후 백그라운드에서 위험도 계산 시작
        calculateAllDistrictRiskLevelsOptimized();
      })
      .catch((error) => {
        console.error('Error loading data:', error);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchAllRiverDataOnce = useCallback(async () => {
    const BACKEND = import.meta.env.VITE_BACKEND_API;
    const baseUrl = `${BACKEND}/api/river-stage`;

    // 하천 목록
    const allRivers = [
      ...new Set([
        '탄천',
        '안양천',
        '도림천',
        '중랑천',
        '목감천',
        '우이천',
        '방학천',
        '한강',
        '홍제천',
        '불광천',
        '청계천',
      ]),
    ];

    const cache: { [key: string]: RiverStation[] } = {};

    // 병렬로 모든 하천 데이터 가져오기
    const riverPromises = allRivers.map(async (river) => {
      try {
        const {
          data: { ListRiverStageService },
        } = await axios.get(`${baseUrl}/${encodeURIComponent(river)}`);
        cache[river] = ListRiverStageService?.row || [];
        return { river, success: true };
      } catch (error) {
        console.error(error);
        cache[river] = [];
        return { river, success: false };
      }
    });

    await Promise.all(riverPromises);
    setRiverDataCache(cache);
    return cache;
  }, []);

  // 최적화된 위험도 계산 함수
  const calculateAllDistrictRiskLevelsOptimized = useCallback(async () => {
    setIsLoadingRiskData(true);

    try {
      const cache = await fetchAllRiverDataOnce();

      // 각 구의 위험도 계산
      const districts = Object.keys(DISTRICT_RIVERS);
      const riskLevels: { [key: string]: number } = {};

      districts.forEach((district) => {
        const rivers = DISTRICT_RIVERS[district] || [];
        if (rivers.length === 0) {
          riskLevels[district] = 0;
          return;
        }

        let totalRiskSum = 0;
        let stationCount = 0;

        rivers.forEach((river) => {
          const riverData = cache[river] || [];
          const filteredData = riverData.filter((station: RiverStation) => station.GU_OFC_NM === district);

          filteredData.forEach((station: RiverStation) => {
            const currentLevel = parseFloat(station.RLTM_RVR_WATL_CNT);
            const floodLevel = parseFloat(station.PLAN_FLDE);

            if (!isNaN(currentLevel) && !isNaN(floodLevel) && floodLevel > 0) {
              const riskRatio = currentLevel / floodLevel;
              totalRiskSum += riskRatio;
              stationCount++;
            }
          });
        });

        riskLevels[district] = stationCount > 0 ? totalRiskSum / stationCount : 0;
      });

      setDistrictRiskLevels(riskLevels);
    } catch (error) {
      console.error('위험도 계산 실패:', error);
    } finally {
      setIsLoadingRiskData(false);
    }
  }, [DISTRICT_RIVERS, fetchAllRiverDataOnce]);

  // 실시간 하천 수위 API (캐시 활용)
  const fetchRealTimeRiverData = useCallback(
    async (districtName: string) => {
      try {
        // 캐시가 있으면 캐시 사용, 없으면 새로 로드
        let cache = riverDataCache;
        if (Object.keys(cache).length === 0) {
          cache = await fetchAllRiverDataOnce();
        }

        const rivers = DISTRICT_RIVERS[districtName] || [];
        const riverResults = rivers.map((river) => {
          const riverData = cache[river] || [];
          const filteredData = riverData.filter((station: RiverStation) => {
            const stationDistrict = station.GU_OFC_NM;
            return stationDistrict === districtName;
          });

          return {
            riverName: river,
            data: filteredData,
          };
        });

        // 데이터가 있는 하천만 필터링
        const resultsWithData = riverResults.filter((result) => result.data.length > 0);
        setRealTimeRiverData(resultsWithData);
      } catch (error) {
        console.error('실시간 하천 데이터 가져오기 실패:', error);
        setRealTimeRiverData([]);
      }
    },
    [riverDataCache, DISTRICT_RIVERS, fetchAllRiverDataOnce]
  );

  // D3.js로 지도 그리기
  useEffect(() => {
    if (geoData && svgRef.current) {
      const svg = d3.select(svgRef.current);

      // 기존 요소들 제거
      svg.selectAll('*').remove();

      // TopoJSON to GeoJSON
      const features = topojson.feature(geoData, geoData.objects.seoul_EPSG5179) as GeoFeatureCollection;

      // 지도 투영 설정
      const projection = d3.geoIdentity().reflectY(true).fitSize([dimensions.width, dimensions.height], features);

      // 경로 생성기
      const pathGenerator = d3.geoPath().projection(projection);

      // 텍스트 위치 오프셋 설정
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getTextX = (d: any) => {
        const centroid = pathGenerator.centroid(d);
        const districtOffsets: { [key: string]: [number, number] } = {
          중구: [-10, 0],
          종로구: [0, -5],
          용산구: [0, 5],
          성동구: [5, 0],
          광진구: [0, -8],
          중랑구: [8, 0],
          성북구: [-5, 0],
          강북구: [0, -3],
          도봉구: [0, 5],
          노원구: [0, 8],
          은평구: [-8, 0],
          서대문구: [0, -3],
          마포구: [-5, 5],
          양천구: [0, 3],
          강서구: [0, 8],
          구로구: [0, -3],
          금천구: [0, 0],
          영등포구: [5, 0],
          동작구: [0, -5],
          관악구: [0, 5],
          서초구: [0, 0],
          강남구: [0, 0],
          송파구: [0, 0],
          강동구: [8, 0],
        };
        const offset = districtOffsets[d.properties.nm] || [0, 0];
        return centroid[0] + offset[0];
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getTextY = (d: any) => {
        const centroid = pathGenerator.centroid(d);
        const districtOffsets: { [key: string]: [number, number] } = {
          중구: [-10, 0],
          종로구: [0, 20],
          용산구: [0, 5],
          성동구: [5, 0],
          광진구: [0, -8],
          동대문구: [0, 3],
          중랑구: [8, 0],
          성북구: [-5, 0],
          강북구: [0, -3],
          도봉구: [0, 5],
          노원구: [0, 8],
          은평구: [-8, 0],
          서대문구: [0, -3],
          마포구: [-5, 5],
          양천구: [0, 3],
          강서구: [0, 8],
          구로구: [0, -3],
          금천구: [0, 0],
          영등포구: [5, 0],
          동작구: [0, -5],
          관악구: [0, 5],
          서초구: [0, 0],
          강남구: [0, 0],
          송파구: [0, 0],
          강동구: [8, 0],
        };
        const offset = districtOffsets[d.properties.nm] || [0, 0];
        return centroid[1] + offset[1];
      };

      // 폰트 크기 설정
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getFontSize = (d: any) => {
        const bounds = pathGenerator.bounds(d);
        const width = bounds[1][0] - bounds[0][0];
        const height = bounds[1][1] - bounds[0][1];
        const area = width * height;
        if (area < 2000) return '10px';
        if (area < 5000) return '11px';
        return '12px';
      };

      // 구역 색상 설정
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const getPathFill = (d: any) => {
        if (selectedDistrict && selectedDistrict.name === d.properties.nm) {
          const selectedRiskLevel = districtRiskLevels[d.properties.nm];
          if (selectedRiskLevel !== undefined && selectedRiskLevel > 0) {
            const baseColor = getRiskColor(selectedRiskLevel);
            return d3.color(baseColor)?.brighter(0.2)?.toString() || baseColor;
          }
          return '#d1d5db';
        }

        // 위험도에 따른 색상 적용
        const districtName = d.properties.nm;
        const riskLevel = districtRiskLevels[districtName];

        if (riskLevel !== undefined && riskLevel > 0) {
          return getRiskColor(riskLevel);
        }

        return '#e5e7eb';
      };

      // SVG 지도 렌더링
      svg
        .selectAll('path')
        .data(features.features)
        .enter()
        .append('path')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('d', (d: any) => pathGenerator(d))
        .attr('fill', getPathFill)
        .attr('stroke', '#fff')
        .attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('mouseover', function (_, d: any) {
          if (!selectedDistrict || selectedDistrict.name !== d.properties.nm) {
            const districtName = d.properties.nm;
            const riskLevel = districtRiskLevels[districtName];

            if (riskLevel !== undefined && riskLevel > 0) {
              // 위험도별 색상에서 약간 어둡게
              const baseColor = getRiskColor(riskLevel);
              d3.select(this).attr('fill', d3.color(baseColor)?.darker(0.2)?.toString() || baseColor);
            } else {
              d3.select(this).attr('fill', '#d1d5db');
            }
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('mouseout', function (_, d: any) {
          if (!selectedDistrict || selectedDistrict.name !== d.properties.nm) {
            const districtName = d.properties.nm;
            const riskLevel = districtRiskLevels[districtName];

            if (riskLevel !== undefined && riskLevel > 0) {
              d3.select(this).attr('fill', getRiskColor(riskLevel));
            } else {
              d3.select(this).attr('fill', '#e5e7eb');
            }
          }
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .on('click', function (_, d: any) {
          const districtName = d.properties.nm;
          setSelectedDistrict({
            name: districtName,
            coordinates: pathGenerator.centroid(d),
            bounds: pathGenerator.bounds(d),
            area: d3.geoArea(d),
          });

          // 하천 데이터
          fetchRealTimeRiverData(districtName);

          // 선택된 구역 하이라이트
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          svg.selectAll('path').attr('fill', (pathData: any) => {
            if (pathData.properties.nm === districtName) {
              const selectedRiskLevel = districtRiskLevels[districtName];
              if (selectedRiskLevel !== undefined && selectedRiskLevel > 0) {
                const baseColor = getRiskColor(selectedRiskLevel);
                return d3.color(baseColor)?.darker(0.3)?.toString() || baseColor;
              }
              return '#9ca3af'; // 데이터가 없는 경우
            }

            // 위험도에 따른 색상 적용
            const pathDistrictName = pathData.properties.nm;
            const riskLevel = districtRiskLevels[pathDistrictName];

            if (riskLevel !== undefined && riskLevel > 0) {
              return getRiskColor(riskLevel);
            }

            // 데이터가 없는 경우 기본 회색
            return '#e5e7eb';
          });
        });

      // 구역 이름 표시
      svg
        .selectAll('text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .data((features as any).features)
        .enter()
        .append('text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('x', (d: any) => getTextX(d))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('y', (d: any) => getTextY(d))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .attr('font-size', (d: any) => getFontSize(d))
        .attr('font-family', 'Arial, sans-serif')
        .attr('fill', '#333')
        .attr('font-weight', '500')
        .attr('pointer-events', 'none')
        .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.9)')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .text((d: any) => d.properties.nm);
    }
  }, [geoData, selectedDistrict, districtRiskLevels, fetchRealTimeRiverData, dimensions]);

  return (
    <div className='flex flex-col items-center p-3 sm:p-6 min-h-screen bg-gray-50'>
      <h2 className='text-xl sm:text-2xl lg:text-3xl font-bold text-gray-800 mb-2 sm:mb-4 text-center'>
        서울시 하천 수위 지도
      </h2>
      <p className='text-gray-600 text-xs sm:text-sm mb-4 sm:mb-6 text-center px-2'>
        각 구역을 클릭하면 상세 정보를 볼 수 있습니다.
      </p>

      {/* 로딩 */}
      {isLoadingRiskData && (
        <div className='mb-4 px-3 sm:px-4 py-2 bg-blue-100 border border-blue-300 rounded-lg mx-2 sm:mx-0'>
          <p className='text-blue-700 text-xs sm:text-sm'>🔄 하천 수위 데이터를 불러오는 중...</p>
        </div>
      )}

      <div className='flex flex-col lg:flex-row gap-4 lg:gap-12 w-full max-w-7xl'>
        <div className='flex flex-col w-full lg:w-auto'>
          <div className='flex justify-center'>
            <svg
              ref={svgRef}
              width={dimensions.width}
              height={dimensions.height}
              className='border border-gray-200 rounded-lg shadow-sm'
            ></svg>
          </div>

          {/* 범례 */}
          <div className='mt-4 p-3 sm:p-4 bg-white border border-gray-300 rounded-lg shadow-sm mx-2 sm:mx-0'>
            <h4 className='text-xs sm:text-sm font-semibold mb-2 text-gray-700'>위험도 범례</h4>
            <div className='grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-4 text-xs'>
              <div className='flex items-center gap-1 sm:gap-2'>
                <div className='w-3 h-3 sm:w-4 sm:h-4 bg-red-600 rounded'></div>
                <span className='text-xs'>위험 (95%~)</span>
              </div>
              <div className='flex items-center gap-1 sm:gap-2'>
                <div className='w-3 h-3 sm:w-4 sm:h-4 bg-orange-500 rounded'></div>
                <span className='text-xs'>경계 (85%~)</span>
              </div>
              <div className='flex items-center gap-1 sm:gap-2'>
                <div className='w-3 h-3 sm:w-4 sm:h-4 bg-yellow-500 rounded'></div>
                <span className='text-xs'>주의 (70%~)</span>
              </div>
              <div className='flex items-center gap-1 sm:gap-2'>
                <div className='w-3 h-3 sm:w-4 sm:h-4 bg-[#40c057] rounded'></div>
                <span className='text-xs'>관심 (30%~)</span>
              </div>
              <div className='flex items-center gap-1 sm:gap-2 col-span-2 sm:col-span-1'>
                <div className='w-3 h-3 sm:w-4 sm:h-4 bg-[#9ca3af] rounded'></div>
                <span className='text-xs'>데이터 없음</span>
              </div>
            </div>
          </div>
        </div>

        {/* (영역 클릭시) 상세 정보 */}
        {selectedDistrict && (
          <div className='w-full lg:min-w-auto lg:max-w-auto max-h-96 lg:max-h-[700px] overflow-y-auto p-4 sm:p-5 border border-gray-300 rounded-lg bg-white shadow-sm sm:mx-0'>
            <div className='flex justify-between items-center mb-4'>
              <h3 className='m-0 text-base sm:text-lg font-semibold text-gray-700'>{selectedDistrict.name}</h3>
              <button
                onClick={() => setSelectedDistrict(null)}
                className='lg:hidden px-3 py-1 bg-red-500 text-white border-0 rounded text-sm cursor-pointer hover:bg-red-600 transition-colors'
              >
                ✕
              </button>
            </div>

            <div className='leading-6 sm:leading-7 text-sm sm:text-base'>
              {/* 하천 수위 정보 */}
              {realTimeRiverData && realTimeRiverData.length > 0 ? (
                <>
                  <div className='ml-1 sm:ml-2.5 text-sm sm:text-base text-gray-500'>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {realTimeRiverData.map((riverGroup: any, groupIndex: number) => (
                      <div key={groupIndex} className='mb-3'>
                        <strong className='text-gray-700 text-sm sm:text-base'>{riverGroup.riverName}</strong>
                        {riverGroup.data.length > 0 ? (
                          /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                          riverGroup.data.map((station: any, stationIndex: number) => (
                            <div key={stationIndex} className='ml-2 sm:ml-3 mt-2 text-xs sm:text-sm'>
                              <div className='mb-1'>
                                <strong className='text-sm'>{station.WATG_NM}</strong>{' '}
                                <span className='text-gray-500'>({station.GU_OFC_NM})</span>
                              </div>
                              <div className='mb-1'>
                                현재 수위: <span className='text-blue-600 font-bold'>{station.RLTM_RVR_WATL_CNT}m</span>
                              </div>
                              <div className='mb-1'>계획홍수위: {station.PLAN_FLDE}m</div>
                              <div className='mb-1'>
                                위험도:
                                <span
                                  className={`font-bold ${
                                    station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.95
                                      ? 'text-red-600'
                                      : station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.85
                                      ? 'text-orange-500'
                                      : station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.7
                                      ? 'text-yellow-500'
                                      : 'text-green-600'
                                  }`}
                                >
                                  {station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.95
                                    ? ' 위험'
                                    : station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.85
                                    ? ' 경계'
                                    : station.RLTM_RVR_WATL_CNT / station.PLAN_FLDE >= 0.7
                                    ? ' 주의'
                                    : ' 관심'}
                                </span>
                              </div>
                              <div className='text-xs text-gray-400'>
                                업데이트: {new Date(station.DTRSM_DATA_CLCT_TM).toLocaleString()}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className='ml-2 sm:ml-3 mt-2 text-gray-400 text-xs'>
                            {riverGroup.riverName}에 해당하는 {selectedDistrict.name} 관측소가 없습니다.
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </>
              ) : realTimeRiverData === null ? (
                <p className='text-gray-400 text-xs'>하천 수위 정보를 불러오는 중...</p>
              ) : (
                <p className='text-gray-400 text-xs'>{selectedDistrict.name}의 실시간 하천 수위 정보가 없습니다.</p>
              )}
            </div>

            <button
              onClick={() => setSelectedDistrict(null)}
              className='hidden lg:block mt-4 w-full px-4 py-2 bg-red-500 text-white border-0 rounded cursor-pointer hover:bg-red-600 transition-colors text-sm sm:text-base'
            >
              닫기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default KoreaMap;
