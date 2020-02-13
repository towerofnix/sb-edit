import { generateId } from "./util/id";

type ScalarValue = string | number | boolean;

export default class List {
  public name: string;
  public value: ScalarValue[];

  public visible: boolean = true;
  public x: number = 0;
  public y: number = 0;
  public width: number = null;
  public height: number = null;

  public id: string;

  constructor(
    options: {
      name: string;
      value: ScalarValue[];

      visible?: boolean;
      x?: number;
      y?: number;
      width?: number;
      height?: number;

      id?: string;
    }
  ) {
    Object.assign(this, options);

    if (!this.id) {
      this.id = generateId();
    }
  }

  public setName(name: string) {
    this.name = name;
  }
}
