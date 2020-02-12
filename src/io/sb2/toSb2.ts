import Block from "../../Block";
import Costume from "../../Costume";
import Project from "../../Project";
import Script from "../../Script";
import Sound from "../../Sound";
import Target, { Sprite, Stage } from "../../Target";
import * as BlockInput from "../../BlockInput";
import { OpCode } from "../../OpCode";

import { Sb2Target, Sb2Stage, Sb2Sprite } from "./interfaces";

interface ToSb2Options {
  penCostume?: Costume,

  convertUnsupportedSound(sound: Sound): Sound,
  getSoundFormat(sound: Sound): "" | "adpcm" | "squeak"
}

interface ToSb2Output {
  json: string,
  counterMap: {[key: string]: any[]}
}

export default function toSb2(
  options: Partial<ToSb2Options> = {}
): ToSb2Output {
  const project: Project = this;

  const counters: {[key: string]: number} = {};
  const counterMap: {[key: string]: any[]} = {};

  const dependencies = Symbol('dependencies');

  function incrementCounter(key: string, value: any): number {
    if (!(key in counters)) {
      counters[key] = 0;
      counterMap[key] = [];
    }

    const index = counters[key]++;
    counterMap[key][index] = value;
    return index;
  }

  function combineDependenciesFrom(from: any[]) {
    const newDeps = {};
    const addDependencies = (dependenciesObject: {string: any[]}) => {
      if (!dependenciesObject) {
        return;
      }
      for (const [type, deps] of Object.entries(dependenciesObject)) {
        if (!newDeps[type]) {
          newDeps[type] = [];
        }
        newDeps[type].push(...deps);
      }
    }
    for (const value of from) {
      addDependencies(value && value[dependencies]);
    }
    return newDeps;
  }

  function serializeInput(input: BlockInput.Any, target: Target, flag?: boolean): any {
    if (!input) {
      return null;
    }
    switch (input.type) {
      case "block":
        if (flag) {
          return serializeInput({type: "blocks", value: [input.value]}, target);
        } else {
          const block = serializeBlock(input.value, target);
          const args = block.slice(1);
          const newDeps = combineDependenciesFrom([...args, block]);
          if (Object.keys(newDeps).length) {
            block[dependencies] = newDeps;
          }
          return block;
        }
      case "blocks":
        const result = input.value.map(block => {
          const result = serializeInput({type: "block", value: block}, target);
          const {stack: stackDependencies, ...rest} = result[dependencies] || {};
          const ret = [...stackDependencies || [], result];
          if (Object.keys(rest).length) {
            return Object.assign(ret, {[dependencies]: rest});
          } else {
            return ret;
          }
        });
        const newDeps = combineDependenciesFrom(result);
        const allBlocks = result.reduce((acc, blocks) => acc.concat(blocks), []);
        if (Object.keys(newDeps).length) {
          return Object.assign(allBlocks, {[dependencies]: newDeps});
        } else {
          return allBlocks;
        }
      default:
        return input.value;
    }
  }

  function getProcedureSpec(block: Block, target: Target): string {
    if (block.opcode === OpCode.procedures_definition) {
      return block.inputs.ARGUMENTS.value
        .map(({ type, name }) => {
          switch (type) {
            case "label":
              return name;
            case "numberOrString":
              return "%s";
            case "boolean":
              return "%b";
          }
        })
        .join(" ");
    } else if (block.opcode === OpCode.procedures_call) {
      const definition = target.scripts
        .map(s => s.blocks[0])
        .find(
          b => b.opcode === OpCode.procedures_definition && b.inputs.PROCCODE.value === block.inputs.PROCCODE.value
        );
      return getProcedureSpec(definition, target);
    } else {
      return "";
    }
  }

  function serializeBlock(block: Block, target: Target): any {
    const i = (key: string, ...args): any => serializeInput(block.inputs[key], target, ...args);
    switch (block.opcode) {
      case OpCode.motion_movesteps:
        return ['forward:', i('STEPS')];
      case OpCode.motion_turnright:
        return ['turnRight:', i('DEGREES')];
      case OpCode.motion_turnleft:
        return ['turnLeft;', i('DEGREES')];
      case OpCode.motion_pointindirection:
        return ['heading:', i('DIRECTION')];
      case OpCode.motion_pointtowards:
        return ['pointTowards:', i('TOWARDS')];
      case OpCode.motion_gotoxy:
        return ['gotoX:y:', i('X'), i('Y')];
      case OpCode.motion_goto:
        return ['gotoSpriteOrMouse:', i('TO')];
      case OpCode.motion_glidesecstoxy:
        return ['glideSecs:toX:y:elapsed:from:', i('SECS'), i('X'), i('Y')];
      case OpCode.motion_changexby:
        return ['changeXposBy:', i('DX')];
      case OpCode.motion_setx:
        return ['xpos:', i('X')];
      case OpCode.motion_changeyby:
        return ['changeYposBy:', i('DY')];
      case OpCode.motion_sety:
        return ['ypos:', i('Y')];
      case OpCode.motion_ifonedgebounce:
        return ['bounceOffEdge'];
      case OpCode.motion_setrotationstyle:
        return ['setRotationStyle', i('STYLE')];
      case OpCode.motion_xposition:
        return ['xpos'];
      case OpCode.motion_yposition:
        return ['ypos'];
      case OpCode.motion_direction:
        return ['heading'];
      case OpCode.motion_scroll_right:
        return ['scrollRight', i('DISTANCE')];
      case OpCode.motion_scroll_up:
        return ['scrollUp', i('DISTANCE')];
      case OpCode.motion_align_scene:
        return ['scrollAlign', i('ALIGNMENT')];
      case OpCode.motion_xscroll:
        return ['xScroll'];
      case OpCode.motion_yscroll:
        return ['yScroll'];
      case OpCode.looks_sayforsecs:
        return ['say:duration:elapsed:from:', i('MESSAGE'), i('SECS')];
      case OpCode.looks_say:
        return ['say:', i('MESSAGE')];
      case OpCode.looks_thinkforsecs:
        return ['think:duration:elapsed:from:', i('MESSAGE'), i('SECS')];
      case OpCode.looks_think:
        return ['think:', i('MESSAGE')];
      case OpCode.looks_show:
        return ['show'];
      case OpCode.looks_hide:
        return ['hide'];
      case OpCode.looks_hideallsprites:
        return ['hideAll'];
      case OpCode.looks_switchcostumeto:
        return ['lookLike:', i('COSTUME')];
      case OpCode.looks_nextcostume:
        return ['nextCostume'];
      case OpCode.looks_switchbackdropto:
        return ['startScene', i('BACKDROP')];
      case OpCode.looks_changeeffectby:
        return ['changeGraphicEffect:by:', i('EFFECT'), i('CHANGE')];
      case OpCode.looks_seteffectto:
        return ['setGraphicEffect:to:', i('EFFECT'), i('VALUE')];
      case OpCode.looks_cleargraphiceffects:
        return ['filterReset'];
      case OpCode.looks_changesizeby:
        return ['changeSizeBy:', i('CHANGE')];
      case OpCode.looks_setsizeto:
        return ['setSizeTo:', i('SIZE')];
      case OpCode.looks_changestretchby:
        return ['changeStretchBy:', i('CHANGE')];
      case OpCode.looks_setstretchto:
        return ["setStretchTo:", i("STRETCH")];
      case OpCode.looks_gotofrontback:
        if (block.inputs.FRONT_BACK.value === "front") {
          return ["comeToFront"];
        } else {
          return ["goBackByLayers:", ["/", 1, 0]];
        }
      case OpCode.looks_goforwardbackwardlayers:
        const layers = i("NUM");
        if (block.inputs.FORWARD_BACKWARD.value === "forward") {
          if (typeof layers === 'number') {
            return ["goBackByLayers:", -layers];
          } else {
            return ["goBackByLayers:", ["-", 0, layers]];
          }
        } else {
          return ["goBackByLayers:", layers];
        }
      case OpCode.looks_costumenumbername:
        if (block.inputs.NUMBER_NAME.value === "number") {
          return ["costumeIndex"];
        } else {
          return ["costumeName"];
        }
      case OpCode.looks_backdropnumbername:
        if (block.inputs.NUMBER_NAME.value === "number") {
          return ["backgroundIndex"];
        } else {
          return ["sceneName"];
        }
      case OpCode.looks_size:
        return ["scale"];
      case OpCode.looks_switchbackdroptoandwait:
        return ["startSceneAndWait", i("BACKDROP")];
      case OpCode.looks_nextbackdrop:
        return ["nextScene"];
      case OpCode.sound_play:
        return ["playSound:", i("SOUND_MENU")];
      case OpCode.sound_playuntildone:
        return ["doPlaySoundAndWait", i("SOUND_MENU")];
      case OpCode.sound_stopallsounds:
        return ["stopAllSounds"];
      case OpCode.music_playDrumForBeats:
        return ["playDrum", i("DRUM"), i("BEATS")];
      case OpCode.music_midiPlayDrumForBeats:
        return ["drum:duration:elapsed:from:", i("DRUM"), i("BEATS")];
      case OpCode.music_restForBeats:
        return ["rest:elapsed:from:", i("BEATS")];
      case OpCode.music_playNoteForBeats:
        return ["noteOn:duration:elapsed:from:", i("NOTE"), i("BEATS")];
      case OpCode.music_setInstrument:
        return ["instrument:", i("INSTRUMENT")];
      case OpCode.music_midiSetInstrument:
        return ["midiInstrument:", i("INSTRUMENT")];
      case OpCode.sound_changevolumeby:
        return ["changeVolumeBy:", i("VOLUME")];
      case OpCode.sound_setvolumeto:
        return ["setVolumeTo:", i("VOLUME")];
      case OpCode.sound_volume:
        return ["volume"];
      case OpCode.music_changeTempo:
        return ["changeTempoBy:", i("TEMPO")];
      case OpCode.music_setTempo:
        return ["setTempoTo:", i("TEMPO")];
      case OpCode.music_getTempo:
        return ["tempo"];
      case OpCode.pen_clear:
        return ["clearPenTrails"];
      case OpCode.pen_stamp:
        return ["stampCostume"];
      case OpCode.pen_penDown:
        return ["putPenDown"];
      case OpCode.pen_penUp:
        return ["putPenUp"];
      case OpCode.pen_setPenColorToColor:
        return ["penColor:", i("COLOR")];
      case OpCode.pen_changePenHueBy:
        return ["changePenHueBy:", i("HUE")];
      case OpCode.pen_setPenHueToNumber:
        return ["setPenHueTo:", i("HUE")];
      case OpCode.pen_changePenShadeBy:
        return ["changePenShadeBy:", i("SHADE")];
      case OpCode.pen_setPenShadeToNumber:
        return ["setPenShadeTo:", i("SHADE")];
      case OpCode.pen_changePenSizeBy:
        return ["changePenSizeBy:", i("SIZE")];
      case OpCode.pen_setPenSizeTo:
        return ["penSize:", i("SIZE")];
      case OpCode.videoSensing_videoOn:
        return ["senseVideoMotion", i("ATTRIBUTE"), i("SUBJECT")];
      case OpCode.event_whenflagclicked:
        return ["whenGreenFlag"];
      case OpCode.event_whenkeypressed:
        return ["whenKeyPressed", i("KEY_OPTION")];
      case OpCode.event_whenthisspriteclicked:
      case OpCode.event_whenstageclicked:
        return ["whenClicked"];
      case OpCode.event_whenbackdropswitchesto:
        return ["whenSceneStarts", i("BACKDROP")];
      case OpCode.videoSensing_whenMotionGreaterThan:
        return ["whenSensorGreaterThan", "video motion", i("REFERENCE")];
      case OpCode.event_whengreaterthan:
        return ["whenSensorGreaterThan", i("WHENGREATERTHANMENU"), i("VALUE")];
      case OpCode.event_whenbroadcastreceived:
        return ["whenIReceive", i("BROADCAST_OPTION")];
      case OpCode.event_broadcast:
        return ["broadcast:", i("BROADCAST_INPUT")];
      case OpCode.event_broadcastandwait:
        return ["doBroadcastAndWait", i("BROADCAST_INPUT")];
      case OpCode.control_wait:
        return ["wait:elapsed:from:", i("DURATION")];
      case OpCode.control_repeat:
        return ["doRepeat", i("TIMES"), i("SUBSTACK", true)];
      case OpCode.control_forever:
        return ["doForever", i("SUBSTACK", true)];
      case OpCode.control_if:
        return ["doIf", i("CONDITION"), i("SUBSTACK", true)];
      case OpCode.control_if_else:
        return ["doIfElse", i("CONDITION"), i("SUBSTACK", true), i("SUBSTACK2", true)];
      case OpCode.control_wait_until:
        return ["doWaitUntil", i("CONDITION")];
      case OpCode.control_repeat_until:
        return ["doUntil", i("CONDITION"), i("SUBSTACK", true)];
      case OpCode.control_while:
        return ["doWhile", i("CONDITION"), i("SUBSTACK", true)];
      case OpCode.control_for_each:
        return ["doForLoop", i("VARIABLE"), i("VALUE"), i("SUBSTACK", true)];
      case OpCode.control_stop:
        return ["stopScripts", i("STOP_OPTION")];
      case OpCode.control_start_as_clone:
        return ["whenCloned"];
      case OpCode.control_create_clone_of:
        return ["createCloneOf", i("CLONE_OPTION")];
      case OpCode.control_delete_this_clone:
        return ["deleteClone"];
      case OpCode.control_get_counter:
        return ["COUNT"];
      case OpCode.control_incr_counter:
        return ["INCR_COUNT"];
      case OpCode.control_clear_counter:
        return ["CLR_COUNT"];
      case OpCode.control_all_at_once:
        return ["warpSpeed", i("SUBSTACK", true)];
      case OpCode.sensing_touchingobjectmenu:
        return ["touching:", i("TOUCHINGOBJECTMENU")];
      case OpCode.sensing_touchingcolor:
        return ["touchingColor:", i("COLOR")];
      case OpCode.sensing_coloristouchingcolor:
        return ["color:sees:", i("COLOR"), i("COLOR2")];
      case OpCode.sensing_distanceto:
        return ["distanceTo:", i("DISTANCETOMENU")];
      case OpCode.sensing_askandwait:
        return ["doAsk", i("QUESTION")];
      case OpCode.sensing_answer:
        return ["answer"];
      case OpCode.sensing_keypressed:
        return ["keyPressed:", i("KEY_OPTION")];
      case OpCode.sensing_mousedown:
        return ["mousePressed"];
      case OpCode.sensing_mousex:
        return ["mouseX"];
      case OpCode.sensing_mousey:
        return ["mouseY"];
      case OpCode.sensing_loudness:
        return ["soundLevel"];
      case OpCode.sensing_loud:
        return ["isLoud"];
      case OpCode.videoSensing_videoToggle:
        return ["setVideoState", i("VIDEO_STATE")];
      case OpCode.videoSensing_setVideoTransparency:
        return ["setVideoTransparency", i("TRANSPARENCY")];
      case OpCode.sensing_timer:
        return ["timer"];
      case OpCode.sensing_resettimer:
        return ["reset timer"];
      case OpCode.sensing_of:
        return ["getAttribute:of:", i("PROPERTY"), i("OBJECT")];
      case OpCode.sensing_current:
        return ["timeAndDate", i("CURRENTMENU")];
      case OpCode.sensing_dayssince2000:
        return ["timestamp"];
      case OpCode.sensing_userid:
        return ["getUserId"];
      case OpCode.operator_add:
        return ["+", i("NUM1"), i("NUM2")];
      case OpCode.operator_subtract:
        return ["-", i("NUM1"), i("NUM2")];
      case OpCode.operator_multiply:
        return ["*", i("NUM1"), i("NUM2")];
      case OpCode.operator_divide:
        return ["/", i("NUM1"), i("NUM2")];
      case OpCode.operator_random:
        return ["randomFrom:to:", i("FROM"), i("TO")];
      case OpCode.operator_lt:
        return ["<", i("OPERAND1"), i("OPERAND2")];
      case OpCode.operator_equals:
        return ["=", i("OPERAND1"), i("OPERAND2")];
      case OpCode.operator_gt:
        return [">", i("OPERAND1"), i("OPERAND2")];
      case OpCode.operator_and:
        return ["&", i("OPERAND1"), i("OPERAND2")];
      case OpCode.operator_or:
        return ["|", i("OPERAND1"), i("OPERAND2")];
      case OpCode.operator_not:
        return ["not", i("OPERAND")];
      case OpCode.operator_join:
        return ["concatenate:with:", i("STRING1"), i("STRING2")];
      case OpCode.operator_letter_of:
        return ["letter:of:", i("LETTER"), i("STRING")];
      case OpCode.operator_length:
        return ["stringLength:", i("STRING")];
      case OpCode.operator_mod:
        return ["%", i("NUM1"), i("NUM2")];
      case OpCode.operator_round:
        return ["rounded", i("NUM")];
      case OpCode.operator_mathop:
        return ["computeFunction:of:", i("OPERATOR"), i("NUM")];
      case OpCode.data_variable:
        return ["readVariable", i("VARIABLE")];
      case OpCode.data_setvariableto:
        return ["setVar:to:", i("VARIABLE"), i("VALUE")];
      case OpCode.data_changevariableby:
        return ["changeVar:by:", i("VARIABLE"), i("VALUE")];
      case OpCode.data_showvariable:
        return ["showVariable:", i("VARIABLE")];
      case OpCode.data_hidevariable:
        return ["hideVariable:", i("VARIABLE")];
      case OpCode.data_listcontents:
        return ["contentsOfList:", i("LIST")];
      case OpCode.data_addtolist:
        return ["append:toList:", i("ITEM"), i("LIST")];
      case OpCode.data_deleteoflist:
        return ["deleteLine:ofList:", i("INDEX"), i("LIST")];
      case OpCode.data_deletealloflist:
        return ["deleteLine:ofList:", "all", i("LIST")];
      case OpCode.data_insertatlist:
        return ["insert:at:ofList:", i("ITEM"), i("INDEX"), i("LIST")];
      case OpCode.data_replaceitemoflist:
        return ["setLine:ofList:to:", i("INDEX"), i("LIST"), i("ITEM")];
      case OpCode.data_itemoflist:
        return ["getLine:ofList:", i("INDEX"), i("LIST")];
      case OpCode.data_itemnumoflist:
        const variableName = "Index " + block.id;
        const procSpec = "calculate " + variableName;
        const list = i("LIST");
        const value = i("ITEM");
        return Object.assign(["readVariable", variableName], {
          [dependencies]: {
            stack: [
              ["call", procSpec]
            ],
            target: [
              [0, 0, [
                ["procDef", procSpec, [], [], true],
                ["setVar:to:", variableName, 1],
                ["doUntil", ["|",
                  ["=", ["getLine:ofList:", ["readVariable", variableName], list], value],
                  [">", ["readVariable", variableName], ["lineCountOfList:", list]]
                ], [
                  ["changeVar:by:", variableName, 1]
                ]]
              ]]
            ]
          }
        });
      case OpCode.data_lengthoflist:
        return ["lineCountOfList:", i("LIST")];
      case OpCode.data_listcontainsitem:
        return ["list:contains:", i("LIST"), i("ITEM")];
      case OpCode.data_showlist:
        return ["showList:", i("LIST")];
      case OpCode.data_hidelist:
        return ["hideList:", i("LIST")];
      case OpCode.procedures_definition:
        const spec = getProcedureSpec(block, target);
        const argumentNames = block.inputs.ARGUMENTS.value
          .filter(({ type }) => type !== "label")
          .map(({ name }) => name);
        const argumentDefaults = block.inputs.ARGUMENTS.value
          .filter(({ type }) => type !== "label")
          .map(({ type }) => {
            switch (type) {
              case "numberOrString":
                return "";
              case "boolean":
                return false;
            }
          });
        return ["procDef", spec, argumentNames, argumentDefaults, block.inputs.WARP.value];
      case OpCode.argument_reporter_string_number:
      case OpCode.argument_reporter_boolean:
        return ["getParam", i("VALUE")];
      case OpCode.procedures_call:
        return ["call", getProcedureSpec(block, target), ...block.inputs.INPUTS.value.map(input => serializeInput(input, target))];
      default:
        return ['undefined', block.opcode];
    }
  }

  function serializeScript(script: Script, target: Target): any[] {
    const result = serializeInput({
      type: "blocks",
      value: script.blocks
    }, target);

    const ret = [script.x, script.y, result];
    if (result[dependencies]) {
      return Object.assign(ret, {[dependencies]: result[dependencies]});
    } else {
      return ret;
    }
  }

  function serializeScripts(scripts: Script[], target: Target): any[] {
    return scripts.map(script => {
      const result = serializeScript(script, target);
      const dependenciesObject = result[dependencies] || {};
      const {target: targetDependencies, ...rest} = dependenciesObject;
      const ret = [...targetDependencies || [], result];
      if (Object.keys(rest).length) {
        return Object.assign(ret, {[dependencies]: rest});
      } else {
        return ret;
      }
    }).reduce((a, b) => a.concat(b), []);
  }

  function serializeTarget(target: Target): Sb2Target {
    return {
      objName: target.name,
      currentCostumeIndex: target.costumeNumber,

      scripts: serializeScripts(target.scripts, target),

      sounds: target.sounds.map(sound => sound.ext !== "wav" ? options.convertUnsupportedSound(sound) : sound).map(sound => ({
        soundName: sound.name,
        soundID: incrementCounter(sound.ext, sound),
        md5: sound.md5 + "." + sound.ext,
        sampleCount: sound.sampleCount,
        rate: sound.sampleRate,
        format: options.getSoundFormat(sound)
      })),

      costumes: target.costumes.map(costume => ({
        costumeName: costume.name,
        baseLayerID: incrementCounter(costume.ext, costume),
        baseLayerMD5: costume.md5 + "." + costume.ext,
        bitmapResolution: costume.bitmapResolution,
        rotationCenterX: costume.centerX / costume.bitmapResolution,
        rotationCenterY: costume.centerY / costume.bitmapResolution
      })),

      variables: target.variables.map(variable => ({
        name: variable.name,
        value: variable.value,
        isPersistent: variable.cloud
      })),

      lists: target.lists.map(list => ({
        listName: list.name,
        contents: list.value,
        isPersistent: false,
        x: list.x,
        y: list.y,
        width: list.width,
        height: list.height,
        visible: list.visible
      }))
    };
  }

  function serializeSprite(sprite: Sprite, {indexInLibrary}: {indexInLibrary: number}): Sb2Sprite {
    return {
      ...serializeTarget(sprite),
      scratchX: sprite.x,
      scratchY: sprite.y,
      scale: sprite.size / 100,
      direction: sprite.direction,
      rotationStyle: sprite.rotationStyle,
      isDraggable: sprite.isDraggable,
      visible: sprite.visible,
      indexInLibrary
    };
  }

  function serializeStage(stage: Stage): Sb2Stage {
    const {penCostume} = options;
    return {
      ...serializeTarget(stage),
      penLayerMD5: penCostume && penCostume.md5 + "." + penCostume.ext,
      penLayerID: penCostume && incrementCounter(penCostume.ext, penCostume),
      tempoBPM: 60,
      videoAlpha: 0.5,
      children: project.sprites.map((sprite, index) => serializeSprite(sprite, {indexInLibrary: index})),
      info: {}
    }
  }

  const stage = serializeStage(project.stage);

  return {
    json: JSON.stringify(stage),
    counterMap
  };
}
