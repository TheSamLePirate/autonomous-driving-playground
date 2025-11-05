export enum TrackId {
  SIMPLE = "SIMPLE",
  COMPLEX = "COMPLEX",
  EXTREME = "EXTREME",
}

export const TrackLabels: Record<TrackId, string> = {
  [TrackId.SIMPLE]: "Classique",
  [TrackId.COMPLEX]: "Compliquée",
  [TrackId.EXTREME]: "Extrême",
};
