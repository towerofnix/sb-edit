import * as JSZip from "jszip";
import * as sb3 from "./interfaces";

import { OpCode } from "../../OpCode";

import Block, { BlockBase } from "../../Block";
import * as BlockInput from "../../BlockInput";
import Costume from "../../Costume";
import Project from "../../Project";
import Sound from "../../Sound";
import { Sprite, Stage, TargetOptions } from "../../Target";
import { List, Variable } from "../../Data";
import Script from "../../Script";

interface AssetInfo {
  type: "costume" | "sound";
  name: string;
  md5: string;
  ext: string;
  spriteName: string;
}

// "unknown" allows user to store the asset encoded however it's useful to
// them. sb-edit doesn't care, it just stores the asset as it's provided for
// easy access later.
type GetAsset = (info: AssetInfo) => Promise<unknown>;

function extractCostumes(target: sb3.Target, getAsset: GetAsset): Promise<Costume[]> {
  return Promise.all(
    target.costumes.map(
      async (costumeData: sb3.Costume) =>
        new Costume({
          name: costumeData.name,
          asset: await getAsset({
            type: "costume",
            name: costumeData.name,
            md5: costumeData.assetId,
            ext: costumeData.dataFormat,
            spriteName: target.name
          }),

          md5: costumeData.assetId,
          ext: costumeData.dataFormat,

          // It's possible that the rotation center of the costume is null.
          // Because computing a rotation center ourselves would be messy and
          // easily incompatible with Scratch, pass such complexity onto the
          // Scratch implementation running a project exported from sb-edit.
          bitmapResolution: costumeData.bitmapResolution || 2,
          centerX: costumeData.rotationCenterX,
          centerY: costumeData.rotationCenterY
        })
    )
  );
}

async function extractSounds(target: sb3.Target, getAsset: GetAsset): Promise<Sound[]> {
  return Promise.all(
    target.sounds.map(
      async (soundData: sb3.Sound) =>
        new Sound({
          name: soundData.name,
          asset: await getAsset({
            type: "sound",
            name: soundData.name,
            md5: soundData.assetId,
            ext: soundData.dataFormat,
            spriteName: target.name
          }),

          md5: soundData.assetId,
          ext: soundData.dataFormat,

          sampleCount: soundData.sampleCount,
          sampleRate: soundData.rate
        })
    )
  );
}

function getBlockScript(blocks: { [key: string]: sb3.Block }) {
  function getBlockInputs(block: sb3.Block, blockId: string): Block["inputs"] {
    return {
      ...translateInputs(block.inputs),
      ...translateFields(block.fields, block.opcode)
    };

    function translateInputs(inputs: sb3.Block["inputs"]): Block["inputs"] {
      let result: Partial<Record<string, BlockInput.Any>> = {};

      // TODO: do we really need to create a new object every time?
      const addInput = (name: string, value: BlockInput.Any): void => {
        result = { ...result, [name]: value };
      };

      for (const [inputName, input] of Object.entries(inputs)) {
        const value = input[1];
        if (typeof value === "string") {
          const block = blocks[value];
          const inputScript = blockWithNext(value, blockId);
          if (inputScript.length === 1 && blocks[value].shadow) {
            // Procedure prototype (the "example" of what a custom procedure looks like,
            // inside the "define" block) - this is considered a shadow block but requires
            // special care compared to normal shadow blocks, so handle it separately.
            if (block.opcode === OpCode.procedures_prototype) {
              const mutation = (block as sb3.Block<OpCode.procedures_prototype>).mutation;

              // Split proccode (such as "letter %n of %s") into ["letter", "%n", "of", "%s"]
              let parts = mutation.proccode.split(/((^|[^\\])%[nsb])/);
              parts = parts.map(str => str.trim());
              parts = parts.filter(str => str !== "");

              const argNames = JSON.parse(mutation.argumentnames) as string[];
              const argDefaults = JSON.parse(mutation.argumentdefaults) as string[];

              const args: BlockInput.CustomBlockArgument[] = parts.map(part => {
                const optionalToNumber = (value: string | number): string | number => {
                  if (typeof value !== "string") {
                    return value;
                  }
                  const asNum = Number(value);
                  if (!isNaN(asNum)) {
                    return asNum;
                  }
                  return value;
                };

                switch (part) {
                  case "%s":
                  case "%n":
                    return {
                      type: "numberOrString",
                      // TODO: remove non-null assertions
                      name: argNames.shift()!,
                      defaultValue: optionalToNumber(argDefaults.shift()!)
                    };
                  case "%b":
                    return {
                      type: "boolean",
                      // TODO: remove non-null assertions
                      name: argNames.shift()!,
                      defaultValue: argDefaults.shift()! === "true"
                    };
                  default:
                    return {
                      type: "label",
                      name: part
                    };
                }
              });

              addInput("PROCCODE", { type: "string", value: mutation.proccode });
              addInput("ARGUMENTS", { type: "customBlockArguments", value: args });
              addInput("WARP", { type: "boolean", value: mutation.warp === "true" });
            } else {
              // Input contains a shadow block. Conceptually, shadow blocks are weird.
              // We basically just want to copy the important information from the
              // shadow block down into the block containing the shadow. There are some
              // special cases so compute the inputs and fields up-front, then decide
              // how to apply them.
              const shadowInputs = translateInputs(blocks[value].inputs);
              const shadowFields = translateFields(blocks[value].fields, blocks[value].opcode);

              if (blocks[value].opcode === "pen_menu_colorParam") {
                result = {
                  ...result,
                  COLOR_PARAM: (shadowFields as any).colorParam
                };
              } else {
                // For most shadow blocks, just copy the shadow block's fields and inputs
                // into its parent using the exact same names.
                result = {
                  ...result,
                  ...shadowInputs,
                  ...shadowFields
                };
              }
            }
          } else {
            let isBlocks;
            if (BlockBase.isKnownBlock(block.opcode)) {
              const defaultInput = BlockBase.getDefaultInput(block.opcode, inputName);
              if (defaultInput && defaultInput.type === "blocks") {
                isBlocks = true;
              }
            }
            isBlocks = isBlocks || inputScript.length > 1;
            if (isBlocks) {
              addInput(inputName, { type: "blocks", value: inputScript });
            } else {
              addInput(inputName, { type: "block", value: inputScript[0] });
            }
          }
        } else if (value === null) {
          // TODO: use our block data to figure out what's supposed to be here!
          // Null boolean inputs should be false, null block stacks should be null
          continue;
        } else {
          const BIS = sb3.BlockInputStatus;
          switch (value[0]) {
            case BIS.MATH_NUM_PRIMITIVE:
            case BIS.POSITIVE_NUM_PRIMITIVE:
            case BIS.WHOLE_NUM_PRIMITIVE:
            case BIS.INTEGER_NUM_PRIMITIVE: {
              let storedValue: string | number = value[1];
              const asNum = Number(storedValue as string);
              if (!isNaN(asNum)) {
                storedValue = asNum;
              }
              addInput(inputName, { type: "number", value: storedValue });
              break;
            }
            case BIS.ANGLE_NUM_PRIMITIVE:
              addInput(inputName, { type: "angle", value: Number(value[1] as string) });
              break;
            case BIS.COLOR_PICKER_PRIMITIVE:
              addInput(inputName, {
                type: "color",
                value: {
                  r: parseInt(value[1].slice(1, 3), 16),
                  g: parseInt(value[1].slice(3, 5), 16),
                  b: parseInt(value[1].slice(5, 7), 16)
                }
              });
              break;
            case BIS.TEXT_PRIMITIVE:
              addInput(inputName, { type: "string", value: value[1] });
              break;
            case BIS.BROADCAST_PRIMITIVE:
              addInput(inputName, { type: "broadcast", value: value[1] });
              break;
            case BIS.VAR_PRIMITIVE:
              // This is a variable input. Convert it to a variable block.
              addInput(inputName, {
                type: "block",
                value: new BlockBase({
                  opcode: OpCode.data_variable,
                  inputs: { VARIABLE: { type: "variable", value: { id: value[2], name: value[1] } } },
                  parent: blockId
                }) as Block
              });
              break;
            case BIS.LIST_PRIMITIVE:
              // This is a list input. Convert it to a list contents block.
              addInput(inputName, {
                type: "block",
                value: new BlockBase({
                  opcode: OpCode.data_listcontents,
                  inputs: { LIST: { type: "list", value: { id: value[2], name: value[1] } } },
                  parent: blockId
                }) as Block
              });
              break;
          }
        }
      }

      if (block.opcode === OpCode.procedures_call) {
        const mutation = (block as sb3.Block<OpCode.procedures_call>).mutation;
        result = {
          PROCCODE: { type: "string", value: mutation.proccode },
          INPUTS: {
            type: "customBlockInputValues",
            value: (JSON.parse(mutation.argumentids) as string[]).map(argumentid => {
              let value = result[argumentid] as Exclude<BlockInput.Any, BlockInput.CustomBlockInputValues> | undefined;
              if (value === undefined) {
                // TODO: Find a way to determine type of missing input value
                // (Caused by things like boolean procedure_call inputs that
                // were never filled at any time.)
                return { type: "boolean", value: false };
              }
              // Auto-coerce number inputs into numbers
              // TODO: this may lose data!
              if (typeof value.value === "string") {
                const asNum = Number(value.value);
                if (!isNaN(asNum)) {
                  value.value = asNum;
                }
              }
              return value;
            })
          }
        };
      }

      return result;
    }

    function translateFields(fields: sb3.Block["fields"], opcode: OpCode): Block["inputs"] {
      const fieldTypes = sb3.fieldTypeMap[opcode];
      if (!fieldTypes) return {};

      let result: Record<string, BlockInput.FieldAny> = {};
      for (const [fieldName, values] of Object.entries(fields)) {
        const type = fieldTypes[fieldName];
        // TODO: remove this type assertion and actually validate fields
        if (fieldName === "VARIABLE" || fieldName === "LIST") {
          result[fieldName] = { type, value: { id: values[1], name: values[0] } } as BlockInput.FieldAny;
        } else {
          result[fieldName] = { type, value: values[0] } as BlockInput.FieldAny;
        }
      }

      return result;
    }
  }

  function blockWithNext(blockId: string, parentId?: string): Block[] {
    const sb3Block = blocks[blockId];
    const block = new BlockBase({
      opcode: sb3Block.opcode,
      inputs: getBlockInputs(sb3Block, blockId),
      id: blockId,
      parent: parentId,
      next: sb3Block.next ?? undefined
    }) as Block;
    let next: Block[] = [];
    if (typeof sb3Block.next === "string") {
      next = blockWithNext(sb3Block.next, blockId);
    }
    return [block, ...next];
  }

  return blockWithNext;
}

export async function fromSb3JSON(json: sb3.ProjectJSON, options: { getAsset: GetAsset }): Promise<Project> {
  function getVariables(target: sb3.Target): Variable[] {
    return Object.entries(target.variables).map(([id, [name, value, cloud = false]]) => {
      let monitor = json.monitors?.find(monitor => monitor.id === id) as sb3.VariableMonitor;
      if (!monitor) {
        // Sometimes .sb3 files are missing monitors. Fill in with reasonable defaults.
        monitor = {
          id,
          mode: "default",
          opcode: "data_variable",
          params: { VARIABLE: name },
          spriteName: target.name,
          value,
          width: null,
          height: null,
          x: 0,
          y: 0,
          visible: false,
          sliderMin: 0,
          sliderMax: 100,
          isDiscrete: true
        };
      }
      return new Variable({
        name,
        id,
        value,
        cloud,
        visible: monitor.visible,
        mode: monitor.mode,
        x: monitor.x,
        y: monitor.y,
        sliderMin: monitor.sliderMin,
        sliderMax: monitor.sliderMax,
        isDiscrete: monitor.isDiscrete
      });
    });
  }

  function getLists(target: sb3.Target): List[] {
    return Object.entries(target.lists).map(([id, [name, value]]) => {
      let monitor = json.monitors?.find(monitor => monitor.id === id) as sb3.ListMonitor;
      if (!monitor) {
        // Sometimes .sb3 files are missing monitors. Fill in with reasonable defaults.
        monitor = {
          id,
          mode: "list",
          opcode: "data_listcontents",
          params: { LIST: name },
          spriteName: target.name,
          value,
          width: null,
          height: null,
          x: 0,
          y: 0,
          visible: false
        };
      }
      return new List({
        name,
        id,
        value,
        visible: monitor.visible,
        x: monitor.x,
        y: monitor.y,
        // set width and height to undefined if they're 0, null, or undefined
        width: monitor.width || undefined,
        height: monitor.height || undefined
      });
    });
  }

  const stage = json.targets.find(target => target.isStage) as sb3.Stage;

  async function getTargetOptions(target: sb3.Target): Promise<TargetOptions> {
    const [costumes, sounds] = await Promise.all([
      extractCostumes(target, options.getAsset),
      extractSounds(target, options.getAsset)
    ]);

    const getScript = getBlockScript(target.blocks);

    return {
      name: target.name,
      isStage: target.isStage,
      costumes,
      costumeNumber: target.currentCostume,
      sounds,
      scripts: Object.entries(target.blocks)
        .filter(([, block]) => block.topLevel && !block.shadow)
        .map(
          ([id, block]) =>
            new Script({
              blocks: getScript(id),
              x: block.x,
              y: block.y
            })
        ),
      variables: getVariables(target),
      lists: getLists(target),
      volume: target.volume,
      layerOrder: target.layerOrder
    };
  }

  const project = new Project({
    stage: new Stage(await getTargetOptions(stage)),
    sprites: await Promise.all(
      json.targets
        .filter((target): target is sb3.Sprite => !target.isStage)
        .map(
          async (spriteData: sb3.Sprite) =>
            new Sprite({
              ...(await getTargetOptions(spriteData)),
              x: spriteData.x,
              y: spriteData.y,
              size: spriteData.size,
              direction: spriteData.direction,
              rotationStyle: {
                "all around": "normal",
                "left-right": "leftRight",
                "don't rotate": "none"
              }[spriteData.rotationStyle] as "normal" | "leftRight" | "none",
              isDraggable: spriteData.draggable,
              visible: spriteData.visible
            })
        )
    ),
    tempo: stage.tempo,
    videoOn: stage.videoState === "on",
    videoAlpha: stage.videoTransparency
  });

  // Run an extra pass on variables (and lists). Only those which are actually
  // referenced in blocks or monitors should be kept.
  for (const target of [project.stage, ...project.sprites]) {
    let relevantBlocks: Block[];
    if (target === project.stage) {
      relevantBlocks = target.blocks.concat(project.sprites.flatMap(sprite => sprite.blocks));
    } else {
      relevantBlocks = target.blocks;
    }

    const usedVariableIds: Set<string> = new Set();
    for (const block of relevantBlocks) {
      let id: string | null = null;
      if ((block.inputs as { VARIABLE: BlockInput.Variable }).VARIABLE) {
        id = (block.inputs as { VARIABLE: BlockInput.Variable }).VARIABLE.value.id;
      } else if ((block.inputs as { LIST: BlockInput.List }).LIST) {
        id = (block.inputs as { LIST: BlockInput.List }).LIST.value.id;
      } else {
        continue;
      }
      usedVariableIds.add(id);
    }

    for (const varList of [target.variables, target.lists]) {
      for (let i = 0, variable; (variable = varList[i]); i++) {
        if (variable.visible) {
          continue;
        }
        if (usedVariableIds.has(variable.id)) {
          continue;
        }

        varList.splice(i, 1);
        i--;
      }
    }
  }

  return project;
}

export default async function fromSb3(fileData: Parameters<typeof JSZip.loadAsync>[0]): Promise<Project> {
  const inZip = await JSZip.loadAsync(fileData);
  const projectFile = inZip.file("project.json");
  if (!projectFile) {
    throw new Error("Missing project.json");
  }
  const json = await projectFile.async("text");
  const getAsset = async ({ md5, ext }: { md5: string; ext: string }): Promise<ArrayBuffer | undefined> => {
    // TODO: figure out how to handle missing assets
    return inZip.file(`${md5}.${ext}`)?.async("arraybuffer");
  };
  return fromSb3JSON(JSON.parse(json) as sb3.ProjectJSON, { getAsset });
}
