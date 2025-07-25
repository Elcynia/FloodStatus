import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import * as topojson from 'topojson-client';
import axios from 'axios';
import Footer from './Footer';
import Header from './Header';
import type { Topology } from 'topojson-specification';
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson';
import type { RiverGroupData, RiverStation, SelectedDistrict } from '../types/river';

export default function FloodMap() {
  const [geoData, setGeoData] = useState<Topology | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<SelectedDistrict | null>(null);
  const [realTimeRiverData, setRealTimeRiverData] = useState<RiverGroupData[] | null>(null);
  const [districtRiskLevels, setDistrictRiskLevels] = useState<{ [key: string]: number }>({});
  const [isLoadingRiskData, setIsLoadingRiskData] = useState(false);

  const [riverDataCache, setRiverDataCache] = useState<{ [key: string]: RiverStation[] }>({});
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const svgRef = useRef<SVGSVGElement>(null);
  const detailsRef = useRef<HTMLDivElement>(null);

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
    if (riskLevel >= 0) return '#40c057'; // 안전
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

  // (모바일) 영역 클릭 시 자동 스크롤
  useEffect(() => {
    if (selectedDistrict && detailsRef.current && window.innerWidth < 1024) {
      setTimeout(() => {
        detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [selectedDistrict]);

  // D3.js로 지도 그리기
  useEffect(() => {
    if (geoData && svgRef.current) {
      const svg = d3.select(svgRef.current);

      // 기존 요소들 제거
      svg.selectAll('*').remove();

      // TopoJSON to GeoJSON
      const geoJsonResult = topojson.feature(geoData, geoData.objects.seoul_EPSG5179);
      const features = geoJsonResult as FeatureCollection<Geometry, GeoJsonProperties>;

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
        .data(features.features)
        .enter()
        .append('text')
        .attr('x', (d) => getTextX(d))
        .attr('y', (d) => getTextY(d))
        .attr('text-anchor', 'middle')
        .attr('dominant-baseline', 'middle')
        .attr('font-size', (d) => getFontSize(d))
        .attr('font-family', 'Pretendard Variables')
        .attr('fill', '#333')
        .attr('font-weight', '500')
        .attr('pointer-events', 'none')
        .style('text-shadow', '1px 1px 2px rgba(255,255,255,0.9)')
        .text((d) => d.properties?.nm);
    }
  }, [geoData, selectedDistrict, districtRiskLevels, fetchRealTimeRiverData, dimensions]);

  return (
    <>
      <Header />
      <div className='flex flex-col items-center p-3 sm:p-6 min-h-screen bg-gray-50'>
        {/* 로딩 */}
        {isLoadingRiskData && (
          <div className='mb-4 px-3 sm:px-4 py-2 bg-blue-100 border border-blue-300 rounded-lg mx-2 sm:mx-0'>
            <p className='text-blue-700 text-xs sm:text-sm'>🔄 하천 수위 데이터를 불러오는 중...</p>
          </div>
        )}

        <div className='flex flex-col lg:flex-row gap-4 lg:gap-12 w-full max-w-[1350px]'>
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
            <div className='mt-4 p-4 sm:p-6 bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl shadow-lg mx-2 sm:mx-0 hover:shadow-xl transition-shadow duration-300'>
              <div className='flex items-center gap-3 mb-4'>
                <h4 className='text-sm sm:text-base font-bold text-gray-800'>하천 수위 위험도 범례</h4>
              </div>

              <div className='grid grid-cols-2 lg:grid-cols-5 gap-3'>
                <div className='flex items-center gap-2 p-2 rounded-lg bg-red-50 border border-red-100 hover:bg-red-100 transition-colors duration-200'>
                  <div className='w-4 h-4 bg-red-600 rounded-full shadow-sm border-2 border-white'></div>
                  <div className='flex gap-2'>
                    <span className='text-xs font-bold text-red-700'>위험</span>
                    <span className='text-xs text-red-600'>95%~</span>
                  </div>
                </div>

                <div className='flex items-center gap-2 p-2 rounded-lg bg-orange-50 border border-orange-100 hover:bg-orange-100 transition-colors duration-200'>
                  <div className='w-4 h-4 bg-orange-500 rounded-full shadow-sm border-2 border-white'></div>
                  <div className='flex gap-2'>
                    <span className='text-xs font-bold text-orange-700'>경계</span>
                    <span className='text-xs text-orange-600'>85%~</span>
                  </div>
                </div>

                <div className='flex items-center gap-2 p-2 rounded-lg bg-yellow-50 border border-yellow-100 hover:bg-yellow-100 transition-colors duration-200'>
                  <div className='w-4 h-4 bg-yellow-500 rounded-full shadow-sm border-2 border-white'></div>
                  <div className='flex gap-2'>
                    <span className='text-xs font-bold text-yellow-700'>주의</span>
                    <span className='text-xs text-yellow-600'>70%~</span>
                  </div>
                </div>

                <div className='flex items-center gap-2 p-2 rounded-lg bg-green-50 border border-green-100 hover:bg-green-100 transition-colors duration-200'>
                  <div className='w-4 h-4 bg-[#40c057] rounded-full shadow-sm border-2 border-white'></div>
                  <div className='flex gap-2'>
                    <span className='text-xs font-bold text-green-700'>안전</span>
                    <span className='text-xs text-green-600'>30%~</span>
                  </div>
                </div>

                <div className='flex items-center gap-2 p-2 rounded-lg bg-gray-50 border border-gray-100 hover:bg-gray-100 transition-colors duration-200'>
                  <div className='w-4 h-4 bg-[#9ca3af] rounded-full shadow-sm border-2 border-white'></div>
                  <div className='flex gap-2'>
                    <span className='text-xs font-bold text-gray-700'>데이터 없음</span>
                    <span className='text-xs text-gray-500'>-</span>
                  </div>
                </div>
              </div>

              <div className='mt-4 pt-3 border-t border-gray-100'>
                <p className='text-xs text-gray-500 text-center'>
                  💡 위험도는 현재 수위 대비 계획홍수위 비율로 계산됩니다
                </p>
              </div>
            </div>
          </div>

          {/* (영역 클릭시) 상세 정보 */}
          {selectedDistrict && (
            <div
              ref={detailsRef}
              className='w-full lg:min-w-auto lg:max-w-auto lg:max-h-[calc(900px-15px)] overflow-y-auto bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-2xl shadow-xl sm:mx-0 '
            >
              <div className='bg-gradient-to-r from-sky-600 to-sky-700 p-4 sm:p-6 rounded-t-2xl'>
                <div className='flex justify-between items-center '>
                  <div className='flex items-center gap-3 '>
                    <div className='w-10 h-10 bg-white/20 rounded-full flex items-center justify-center '>
                      <span className='text-white text-lg'>📍</span>
                    </div>
                    <div>
                      <h3 className='m-0 text-lg sm:text-xl font-bold text-white'>{selectedDistrict.name}</h3>
                      <p className='text-blue-100 text-sm mt-1'>실시간 하천 수위 모니터링</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDistrict(null)}
                    className='lg:hidden w-8 h-8 bg-white/20 hover:bg-white/30 text-white border-0 rounded-full flex items-center justify-center cursor-pointer transition-all duration-200'
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className='p-4 sm:p-6'>
                {/* 하천 수위 정보 */}
                {realTimeRiverData && realTimeRiverData.length > 0 ? (
                  <div className='space-y-4'>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {realTimeRiverData.map((riverGroup: any, groupIndex: number) => (
                      <div
                        key={groupIndex}
                        className='bg-white rounded-xl border border-gray-100 overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200'
                      >
                        {/* 하천 헤더 */}
                        <div className='bg-gradient-to-r from-gray-50 to-gray-100 px-4 py-3 border-b border-gray-200'>
                          <div className='flex items-center gap-2'>
                            <span className='text-blue-500 text-lg'>🌊</span>
                            <h4 className='font-bold text-gray-800 text-base sm:text-lg'>{riverGroup.riverName}</h4>
                            <span className='bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium'>
                              {riverGroup.data.length}개 관측소
                            </span>
                          </div>
                        </div>

                        {/* 관측소 데이터 */}
                        <div className='p-4 space-y-4'>
                          {riverGroup.data.length > 0 ? (
                            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
                            riverGroup.data.map((station: any, stationIndex: number) => {
                              const currentLevel = parseFloat(station.RLTM_RVR_WATL_CNT);
                              const floodLevel = parseFloat(station.PLAN_FLDE);
                              const riskRatio = currentLevel / floodLevel;

                              const getRiskInfo = (ratio: number) => {
                                if (ratio >= 0.95)
                                  return {
                                    level: '위험',
                                    color: 'red',
                                    bgColor: 'bg-red-50',
                                    textColor: 'text-red-700',
                                    iconColor: 'text-red-500',
                                    icon: '🚨',
                                  };
                                if (ratio >= 0.85)
                                  return {
                                    level: '경계',
                                    color: 'orange',
                                    bgColor: 'bg-orange-50',
                                    textColor: 'text-orange-700',
                                    iconColor: 'text-orange-500',
                                    icon: '⚠️',
                                  };
                                if (ratio >= 0.7)
                                  return {
                                    level: '주의',
                                    color: 'yellow',
                                    bgColor: 'bg-yellow-50',
                                    textColor: 'text-yellow-700',
                                    iconColor: 'text-yellow-500',
                                    icon: '⚡',
                                  };
                                return {
                                  level: '안전',
                                  color: 'green',
                                  bgColor: 'bg-green-50',
                                  textColor: 'text-green-700',
                                  iconColor: 'text-green-500',
                                  icon: '✅',
                                };
                              };

                              const riskInfo = getRiskInfo(riskRatio);

                              return (
                                <div key={stationIndex} className='bg-gray-50 rounded-lg p-4 border border-gray-100'>
                                  {/* 관측소 정보 */}
                                  <div className='flex items-start justify-between mb-3'>
                                    <div className='flex-1'>
                                      <div className='flex items-center gap-2 mb-1'>
                                        <span className='text-blue-500'>📊</span>
                                        <h5 className='font-bold text-gray-800 text-sm sm:text-base'>
                                          {station.WATG_NM}
                                        </h5>
                                      </div>
                                      <p className='text-gray-500 text-xs'>{station.GU_OFC_NM}</p>
                                    </div>
                                    <div
                                      className={`${riskInfo.bgColor} ${riskInfo.textColor} px-3 py-1 rounded-full flex items-center gap-1`}
                                    >
                                      <span className='text-sm'>{riskInfo.icon}</span>
                                      <span className='font-bold text-xs'>{riskInfo.level}</span>
                                    </div>
                                  </div>

                                  {/* 수위 정보 */}
                                  <div className='grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3'>
                                    <div className='bg-white rounded-lg p-3 border border-blue-100'>
                                      <div className='flex items-center gap-2 mb-1'>
                                        <span className='text-blue-500 text-sm'>💧</span>
                                        <span className='text-gray-600 text-xs font-medium'>현재 수위</span>
                                      </div>
                                      <div className='text-blue-600 font-bold text-lg'>
                                        {station.RLTM_RVR_WATL_CNT}m
                                      </div>
                                    </div>
                                    <div className='bg-white rounded-lg p-3 border border-gray-100'>
                                      <div className='flex items-center gap-2 mb-1'>
                                        <span className='text-gray-500 text-sm'>🏔️</span>
                                        <span className='text-gray-600 text-xs font-medium'>계획홍수위</span>
                                      </div>
                                      <div className='text-gray-700 font-bold text-lg'>{station.PLAN_FLDE}m</div>
                                    </div>
                                  </div>

                                  {/* 위험도 진행률 */}
                                  <div className='mb-3'>
                                    <div className='flex justify-between text-xs text-gray-600 mb-1'>
                                      <span>위험도</span>
                                      <span>{Math.round(riskRatio * 100)}%</span>
                                    </div>
                                    <div className='w-full bg-gray-200 rounded-full h-2'>
                                      <div
                                        className={`h-2 rounded-full transition-all duration-500 ${
                                          riskRatio >= 0.95
                                            ? 'bg-red-500'
                                            : riskRatio >= 0.85
                                            ? 'bg-orange-500'
                                            : riskRatio >= 0.7
                                            ? 'bg-yellow-500'
                                            : 'bg-green-500'
                                        }`}
                                        style={{ width: `${Math.min(riskRatio * 100, 100)}%` }}
                                      ></div>
                                    </div>
                                  </div>

                                  {/* 업데이트 */}
                                  <div className='flex items-center gap-2 text-xs text-gray-400'>
                                    <span>🕒</span>
                                    <span>최종 업데이트: {new Date(station.DTRSM_DATA_CLCT_TM).toLocaleString()}</span>
                                  </div>
                                </div>
                              );
                            })
                          ) : (
                            <div className='text-center py-6 text-gray-400'>
                              <div className='mb-2 text-2xl'>🔍</div>
                              <p className='text-sm'>
                                {riverGroup.riverName}에 해당하는 {selectedDistrict.name} 관측소가 없습니다.
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : realTimeRiverData === null ? (
                  <div className='flex items-center justify-center py-8'>
                    <div className='text-center'>
                      <div className='animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-3'></div>
                      <p className='text-gray-500 text-sm'>하천 수위 정보를 불러오는 중...</p>
                    </div>
                  </div>
                ) : (
                  <div className='text-center py-8'>
                    <div className='mb-3 text-5xl'>❌</div>
                    <p className='text-gray-500 text-sm'>{selectedDistrict.name}의 실시간 하천 수위 정보가 없습니다.</p>
                  </div>
                )}
              </div>

              {/* 닫기 버튼 */}
              <div className='p-4 sm:p-6 border-t border-gray-100'>
                <button
                  onClick={() => setSelectedDistrict(null)}
                  className='hidden lg:block w-full px-4 py-3 bg-gradient-to-r from-gray-600 to-gray-700 hover:from-gray-700 hover:to-gray-800 text-white border-0 rounded-xl cursor-pointer transition-all duration-200 font-medium text-sm sm:text-base shadow-md hover:shadow-lg'
                >
                  <span className='mr-2'>✕</span>
                  닫기
                </button>
              </div>
            </div>
          )}
        </div>
        <Footer />
      </div>
    </>
  );
}
