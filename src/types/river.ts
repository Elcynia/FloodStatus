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

export type { RiverGroupData, RiverStation, SelectedDistrict };
