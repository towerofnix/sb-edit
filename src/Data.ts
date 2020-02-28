import { generateId } from "./util/id";

type ScalarValue = number | string | boolean;

export class Variable {
  public name: string;
  public id: string;

  public value: ScalarValue;
  public cloud: boolean = false;

  public visible: boolean = true;
  public mode: "default" | "slider" | "large" = "default";
  public x: number = 0;
  public y: number = 0;
  public sliderMin: number = 0;
  public sliderMax: number = 100;
  public isDiscrete: boolean = true;

  constructor(options: {
    name: string;
    id?: string;

    value: ScalarValue;
    cloud?: boolean;

    visible?: boolean;
    mode?: "default" | "slider" | "large";
    x?: number;
    y?: number;
    sliderMin?: number;
    sliderMax?: number;
    isDiscrete?: boolean;
  }) {
    Object.assign(this, options);

    if (!this.id) {
      this.id = generateId();
    }
  }

  public setName(name: string) {
    this.name = name;
  }
}

export class List {
  public name: string;
  public value: ScalarValue[];

  public visible: boolean = true;
  public x: number = 0;
  public y: number = 0;
  public width: number = null;
  public height: number = null;

  public id: string;

  constructor(options: {
    name: string;
    value: ScalarValue[];

    visible?: boolean;
    x?: number;
    y?: number;
    width?: number;
    height?: number;

    id?: string;
  }) {
    Object.assign(this, options);

    if (!this.id) {
      this.id = generateId();
    }
  }

  public setName(name: string) {
    this.name = name;
  }
}
