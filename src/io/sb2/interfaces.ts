// NOTE: The following interfaces have only been tested with toSb2.ts.
// They are based on code from scratch-flash as well as inspected project.json
// files, but there may be keys/values missing here. When implementing fromSb2,
// additional care should be placed into testing a variety of sb2s and
// researching the code in scratch-flash.

export interface Sb2Sound {
  soundName: string,
  soundID: number, // project.zip/(soundID).wav or -1 if online
  md5: string, // includes .wav
  sampleCount: number,
  rate: number,
  format: "" | "adpcm" | "squeak"
}

export interface Sb2Costume {
  costumeName: string,
  baseLayerID: number, // project.zip/(baseLayerID).(ext) or -1 if online
  baseLayerMD5: string, // includes .(ext)
  textLayerID?: number, // see LLK/scratch-vm#672
  textLayerMD5?: string,
  bitmapResolution: number,
  rotationCenterX: number,
  rotationCenterY: number
}

export interface Sb2Variable {
  name: string,
  value: (string | number | boolean),
  isPersistent: boolean
}

export interface Sb2List {
  listName: string,
  contents: Array<string | number | boolean>,
  isPersistent: boolean,
  x: number,
  y: number,
  width: number,
  height: number,
  visible: boolean
}

export interface Sb2Target {
  objName: string,
  children?: object,
  variables?: Sb2Variable[],
  lists?: Sb2List[],
  scripts?: any[],
  sounds?: Sb2Sound[],
  costumes: Sb2Costume[],
  currentCostumeIndex: number
}

export interface Sb2Stage extends Sb2Target {
  penLayerID: number, // project.zip/(penLayerID).png or -1 if online
  penLayerMD5: string, // includes .png
  tempoBPM: number, // tempo is global in Scratch; defaults to 60
  videoAlpha: number, // defaults to 0.5
  info: any
}

export interface Sb2Sprite extends Sb2Target {
  scratchX: number,
  scratchY: number,
  scale: number, // 100% = scale: 1
  direction: number,
  rotationStyle: "normal" | "leftRight" | "none",
  isDraggable: boolean,
  indexInLibrary: number, // index in sprite pane
  visible: boolean,
  spriteInfo?: object // extra data for the sprite; not used anywhere in Scratch but is loaded/saved properly
}
