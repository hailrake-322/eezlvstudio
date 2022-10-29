import React from "react";
import { makeObservable, observable } from "mobx";

import {
    registerClass,
    makeDerivedClassInfo,
    PropertyType,
    EezObject,
    ClassInfo,
    MessageType,
    getId,
    getParent
} from "project-editor/core/object";

import { ActionComponent } from "project-editor/flow/component";

import { ValueType } from "project-editor/features/variable/value-type";
import { COMPONENT_TYPE_LVGLACTION } from "project-editor/flow/components/component_types";
import type { IFlowContext } from "project-editor/flow/flow-interfaces";
import { specificGroup } from "project-editor/ui-components/PropertyGrid/groups";
import { humanize } from "eez-studio-shared/string";
import {
    createObject,
    getAncestorOfType,
    getChildOfObject,
    Message,
    propertyNotFoundMessage,
    propertyNotSetMessage
} from "project-editor/store";
import { getProject, ProjectType } from "project-editor/project/project";
import { findPage, Page } from "project-editor/features/page/page";
import { Assets, DataBuffer } from "project-editor/build/assets";
import { ProjectEditor } from "project-editor/project-editor-interface";
import { showGenericDialog } from "eez-studio-ui/generic-dialog";
import {
    LVGLArcWidget,
    LVGLBarWidget,
    LVGLDropdownWidget,
    LVGLImageWidget,
    LVGLLabelWidget,
    LVGLRollerWidget,
    LVGLSliderWidget,
    LVGLWidget
} from "project-editor/lvgl/widgets";
import { LeftArrow } from "project-editor/ui-components/icons";
import { escapeCString } from "project-editor/build/helper";
import {
    LVGLPropertyType,
    makeExpressionProperty
} from "project-editor/lvgl/expression-property";
import { buildExpression } from "project-editor/flow/expression";

////////////////////////////////////////////////////////////////////////////////

const LVGL_ACTIONS = {
    CHANGE_SCREEN: 0,
    PLAY_ANIMATION: 1,
    SET_PROPERTY: 2
};

////////////////////////////////////////////////////////////////////////////////

export class LVGLActionType extends EezObject {
    action: keyof typeof LVGL_ACTIONS;

    static classInfo: ClassInfo = {
        getClass: function (jsObject: any) {
            if (jsObject.action == "CHANGE_SCREEN")
                return LVGLChangeScreenActionType;
            else if (jsObject.action == "PLAY_ANIMATION")
                return LVGLPlayAnimationActionType;
            return LVGLSetPropertyActionType;
        },

        properties: [
            {
                name: "action",
                displayName: (object: LVGLActionType) => {
                    const actions = getParent(object) as LVGLActionType[];
                    if (actions.length < 2) {
                        return "Action";
                    }
                    return `Action #${actions.indexOf(object) + 1}`;
                },
                type: PropertyType.Enum,
                enumItems: Object.keys(LVGL_ACTIONS).map(id => ({
                    id
                })),
                enumDisallowUndefined: true
            }
        ],

        newItem: async (object: LVGLActionType[]) => {
            const project = ProjectEditor.getProject(object);

            const result = await showGenericDialog({
                dialogDefinition: {
                    title: "New LVGL Action",
                    fields: [
                        {
                            name: "action",
                            displayName: "Action type",
                            type: "enum",
                            enumItems: Object.keys(LVGL_ACTIONS).map(id => ({
                                id,
                                label: humanize(id)
                            }))
                        }
                    ]
                },
                values: {
                    action: "CHANGE_SCREEN"
                },
                dialogContext: project
            });

            const actionTypeProperties = {
                action: result.values.action
            };

            let actionTypeObject;

            if (result.values.action == "CHANGE_SCREEN") {
                console.log(LVGLChangeScreenActionType.classInfo.defaultValue);
                actionTypeObject = createObject<LVGLChangeScreenActionType>(
                    project._DocumentStore,
                    Object.assign(
                        actionTypeProperties,
                        LVGLChangeScreenActionType.classInfo.defaultValue
                    ),
                    LVGLChangeScreenActionType
                );
            } else if (result.values.action == "PLAY_ANIMATION") {
                actionTypeObject = createObject<LVGLPlayAnimationActionType>(
                    project._DocumentStore,
                    Object.assign(
                        actionTypeProperties,
                        LVGLPlayAnimationActionType.classInfo.defaultValue
                    ),
                    LVGLPlayAnimationActionType
                );
            } else {
                actionTypeObject = createObject<LVGLSetPropertyActionType>(
                    project._DocumentStore,
                    Object.assign(
                        actionTypeProperties,
                        LVGLSetPropertyActionType.classInfo.defaultValue
                    ),
                    LVGLSetPropertyActionType
                );
            }

            return actionTypeObject;
        }
    };

    constructor() {
        super();
        makeObservable(this, {});
    }

    build(assets: Assets, dataBuffer: DataBuffer) {}

    get actionDescription(): React.ReactNode {
        return "";
    }
}

////////////////////////////////////////////////////////////////////////////////

const FADE_MODES = {
    NONE: 0,
    OVER_LEFT: 1,
    OVER_RIGHT: 2,
    OVER_TOP: 3,
    OVER_BOTTOM: 4,
    MOVE_LEFT: 5,
    MOVE_RIGHT: 6,
    MOVE_TOP: 7,
    MOVE_BOTTOM: 8,
    FADE_IN: 9,
    FADE_OUT: 10,
    OUT_LEFT: 11,
    OUT_RIGHT: 12,
    OUT_TOP: 13,
    OUT_BOTTOM: 14
};

export class LVGLChangeScreenActionType extends LVGLActionType {
    screen: string;
    fadeMode: keyof typeof FADE_MODES;
    speed: number;
    delay: number;

    constructor() {
        super();
        makeObservable(this, {
            screen: observable,
            fadeMode: observable,
            speed: observable,
            delay: observable
        });
    }

    static classInfo = makeDerivedClassInfo(LVGLActionType.classInfo, {
        properties: [
            {
                name: "screen",
                type: PropertyType.ObjectReference,
                referencedObjectCollectionPath: "pages"
            },
            {
                name: "fadeMode",
                type: PropertyType.Enum,
                enumItems: Object.keys(FADE_MODES).map(id => ({
                    id
                })),
                enumDisallowUndefined: true
            },
            {
                name: "speed",
                displayName: "Speed (ms):",
                type: PropertyType.Number
            },
            {
                name: "delay",
                displayName: "Delay (ms):",
                type: PropertyType.Number
            }
        ],
        defaultValue: {
            fadeMode: "FADE_IN",
            speed: 200,
            delay: 0
        },
        check: (object: LVGLChangeScreenActionType) => {
            let messages: Message[] = [];

            if (!object.screen) {
                messages.push(propertyNotSetMessage(object, "screen"));
            } else {
                let page = findPage(getProject(object), object.screen);
                if (!page) {
                    messages.push(propertyNotFoundMessage(object, "screen"));
                }
            }

            return messages;
        }
    });

    override get actionDescription() {
        let singleItem = (getParent(this) as LVGLActionType[]).length == 1;
        return `${singleItem ? "" : "Change screen: "}Screen=${humanize(
            this.screen
        )}, Speed=${this.speed}, Delay=${this.delay}`;
    }

    override build(assets: Assets, dataBuffer: DataBuffer) {
        // screen
        let screen: number = 0;
        if (this.screen) {
            screen = assets.getPageIndex(this, "screen");
        }
        dataBuffer.writeInt32(screen);

        // fadeMode
        dataBuffer.writeUint32(FADE_MODES[this.fadeMode]);

        // speed
        dataBuffer.writeUint32(this.speed);

        // delay
        dataBuffer.writeUint32(this.delay);
    }
}

registerClass("LVGLChangeScreenActionType", LVGLChangeScreenActionType);

////////////////////////////////////////////////////////////////////////////////

const ANIM_PROPERTIES = {
    POSITION_X: 0,
    POSITION_Y: 1,
    WIDTH: 2,
    HEIGHT: 3,
    OPACITY: 4,
    IMAGE_ANGLE: 5,
    IMAGE_ZOOM: 6
};

const ANIM_PATHS = {
    LINEAR: 0,
    EASE_IN: 1,
    EASE_OUT: 2,
    EASE_IN_OUT: 3,
    OVERSHOOT: 4,
    BOUNCE: 5
};

export class LVGLPlayAnimationActionType extends LVGLActionType {
    target: string;
    property: keyof typeof ANIM_PROPERTIES;
    start: number;
    end: number;
    delay: number;
    time: number;
    relative: boolean;
    instant: boolean;
    path: keyof typeof ANIM_PATHS;

    constructor() {
        super();
        makeObservable(this, {
            target: observable,
            delay: observable
        });
    }

    static classInfo = makeDerivedClassInfo(LVGLActionType.classInfo, {
        properties: [
            {
                name: "target",
                type: PropertyType.Enum,
                enumItems: (component: LVGLActionComponent) => {
                    const page = getAncestorOfType(
                        component,
                        ProjectEditor.PageClass.classInfo
                    ) as Page;
                    return [...page._lvglWidgetIdentifiers.keys()].map(id => ({
                        id,
                        label: id
                    }));
                }
            },
            {
                name: "property",
                type: PropertyType.Enum,
                enumItems: Object.keys(ANIM_PROPERTIES).map(id => ({ id })),
                enumDisallowUndefined: true
            },
            {
                name: "start",
                type: PropertyType.Number
            },
            {
                name: "end",
                type: PropertyType.Number
            },
            {
                name: "delay",
                displayName: "Delay (ms):",
                type: PropertyType.Number
            },
            {
                name: "time",
                type: PropertyType.Number
            },
            {
                name: "relative",
                type: PropertyType.Boolean,
                checkboxStyleSwitch: true
            },
            {
                name: "instant",
                type: PropertyType.Boolean,
                checkboxStyleSwitch: true
            },
            {
                name: "path",
                type: PropertyType.Enum,
                enumItems: Object.keys(ANIM_PATHS).map(id => ({ id })),
                enumDisallowUndefined: true
            }
        ],
        defaultValue: {
            property: "POSITION_X",
            start: 0,
            end: 100,
            delay: 0,
            time: 1000,
            relative: true,
            instant: false,
            path: ""
        },
        check: (object: LVGLPlayAnimationActionType) => {
            let messages: Message[] = [];

            if (!object.target) {
                messages.push(propertyNotSetMessage(object, "target"));
            } else {
                const page = getAncestorOfType(
                    object,
                    ProjectEditor.PageClass.classInfo
                ) as Page;
                if (
                    page._lvglWidgetIdentifiers.get(object.target) == undefined
                ) {
                    messages.push(propertyNotFoundMessage(object, "target"));
                }
            }

            return messages;
        }
    });

    override get actionDescription() {
        let singleItem = (getParent(this) as LVGLActionType[]).length == 1;
        return `${singleItem ? "" : "Play animation: "}Target=${
            this.target
        }, Property=${this.property}, Start=${this.start}, End=${
            this.end
        }, Delay=${this.delay}, Time=${this.time}, Relative=${
            this.relative ? "On" : "Off"
        }, Instant=${this.instant ? "On" : "Off"} ${this.path}`;
    }

    override build(assets: Assets, dataBuffer: DataBuffer) {
        // target
        const page = getAncestorOfType(
            this,
            ProjectEditor.PageClass.classInfo
        ) as Page;
        dataBuffer.writeInt32(
            page._lvglWidgetIdentifiers.get(this.target) ?? -1
        );

        // property
        dataBuffer.writeUint32(ANIM_PROPERTIES[this.property]);

        // start
        dataBuffer.writeInt32(this.start);

        // end
        dataBuffer.writeInt32(this.end);

        // delay
        dataBuffer.writeUint32(this.delay);

        // time
        dataBuffer.writeUint32(this.time);

        // flags
        const ANIMATION_ITEM_FLAG_RELATIVE = 1 << 0;
        const ANIMATION_ITEM_FLAG_INSTANT = 1 << 1;
        dataBuffer.writeUint32(
            (this.relative ? ANIMATION_ITEM_FLAG_RELATIVE : 0) |
                (this.instant ? ANIMATION_ITEM_FLAG_INSTANT : 0)
        );

        // path
        dataBuffer.writeUint32(ANIM_PATHS[this.path]);
    }
}

registerClass("LVGLPlayAnimationActionType", LVGLPlayAnimationActionType);

////////////////////////////////////////////////////////////////////////////////

const enum PropertyCode {
    NONE,

    ARC_VALUE,

    BAR_VALUE,

    BASIC_X,
    BASIC_Y,
    BASIC_WIDTH,
    BASIC_HEIGHT,
    BASIC_OPACITY,
    BASIC_HIDDEN,
    BASIC_CHECKED,
    BASIC_DISABLED,

    DROPDOWN_SELECTED,

    IMAGE_IMAGE,
    IMAGE_ANGLE,
    IMAGE_ZOOM,

    LABEL_TEXT,

    ROLLER_SELECTED,

    SLIDER_VALUE
}

type PropertiesType = {
    [targetType: string]: {
        [propName: string]: {
            code: PropertyCode;
            type: "number" | "string" | "boolean" | "image";
            animated: boolean;
        };
    };
};

const PROPERTIES = {
    arc: {
        value: {
            code: PropertyCode.ARC_VALUE,
            type: "number" as const,
            animated: false
        }
    },
    bar: {
        value: {
            code: PropertyCode.BAR_VALUE,
            type: "number" as const,
            animated: true
        }
    },
    basic: {
        x: {
            code: PropertyCode.BASIC_X,
            type: "number" as const,
            animated: false
        },
        y: {
            code: PropertyCode.BASIC_Y,
            type: "number" as const,
            animated: false
        },
        width: {
            code: PropertyCode.BASIC_WIDTH,
            type: "number" as const,
            animated: false
        },
        height: {
            code: PropertyCode.BASIC_HEIGHT,
            type: "number" as const,
            animated: false
        },
        opacity: {
            code: PropertyCode.BASIC_OPACITY,
            type: "number" as const,
            animated: false
        },
        hidden: {
            code: PropertyCode.BASIC_HIDDEN,
            type: "boolean" as const,
            animated: false
        },
        checked: {
            code: PropertyCode.BASIC_CHECKED,
            type: "boolean" as const,
            animated: false
        },
        disabled: {
            code: PropertyCode.BASIC_DISABLED,
            type: "boolean" as const,
            animated: false
        }
    },
    dropdown: {
        selected: {
            code: PropertyCode.DROPDOWN_SELECTED,
            type: "number" as const,
            animated: false
        }
    },
    image: {
        image: {
            code: PropertyCode.IMAGE_IMAGE,
            type: "image" as const,
            animated: false
        },
        angle: {
            code: PropertyCode.IMAGE_ANGLE,
            type: "number" as const,
            animated: false
        },
        zoom: {
            code: PropertyCode.IMAGE_ZOOM,
            type: "number" as const,
            animated: false
        }
    },
    label: {
        text: {
            code: PropertyCode.LABEL_TEXT,
            type: "string" as const,
            animated: false
        }
    },
    roller: {
        selected: {
            code: PropertyCode.ROLLER_SELECTED,
            type: "number" as const,
            animated: true
        }
    },
    slider: {
        value: {
            code: PropertyCode.SLIDER_VALUE,
            type: "number" as const,
            animated: true
        }
    }
};

function setPropertyFilterTarget(
    actionType: LVGLSetPropertyActionType,
    lvglWidget: LVGLWidget
) {
    if (!lvglWidget.identifier) {
        return false;
    }

    if (actionType.targetType == "arc") {
        return lvglWidget instanceof LVGLArcWidget;
    } else if (actionType.targetType == "bar") {
        return lvglWidget instanceof LVGLBarWidget;
    } else if (actionType.targetType == "basic") {
        return true;
    } else if (actionType.targetType == "dropdown") {
        return lvglWidget instanceof LVGLDropdownWidget;
    } else if (actionType.targetType == "image") {
        return lvglWidget instanceof LVGLImageWidget;
    } else if (actionType.targetType == "label") {
        return lvglWidget instanceof LVGLLabelWidget;
    } else if (actionType.targetType == "roller") {
        return lvglWidget instanceof LVGLRollerWidget;
    } else if (actionType.targetType == "slider") {
        return lvglWidget instanceof LVGLSliderWidget;
    } else {
        return false;
    }
}

export class LVGLSetPropertyActionType extends LVGLActionType {
    targetType: keyof typeof PROPERTIES;
    target: string;
    property: string;
    animated: boolean;
    value: number | string | boolean;
    valueType: LVGLPropertyType;

    constructor() {
        super();
        makeObservable(this, {
            targetType: observable,
            target: observable,
            property: observable,
            animated: observable,
            value: observable,
            valueType: observable
        });
    }

    static classInfo = makeDerivedClassInfo(LVGLActionType.classInfo, {
        properties: [
            {
                name: "targetType",
                type: PropertyType.Enum,
                enumItems: Object.keys(PROPERTIES).map(id => ({
                    id
                })),
                enumDisallowUndefined: true
            },
            {
                name: "target",
                displayName: "Target",
                type: PropertyType.Enum,
                enumItems: (actionType: LVGLSetPropertyActionType) => {
                    const page = getAncestorOfType(
                        actionType,
                        ProjectEditor.PageClass.classInfo
                    ) as Page;
                    return page._lvglWidgets
                        .filter(lvglWidget =>
                            setPropertyFilterTarget(actionType, lvglWidget)
                        )
                        .map(lvglWidget => ({
                            id: lvglWidget.identifier,
                            label: lvglWidget.identifier
                        }));
                }
            },
            {
                name: "property",
                type: PropertyType.Enum,
                enumItems: (actionType: LVGLSetPropertyActionType) => {
                    return Object.keys(PROPERTIES[actionType.targetType]).map(
                        id => ({
                            id
                        })
                    );
                },
                enumDisallowUndefined: true
            },
            ...makeExpressionProperty(
                "value",
                "any",
                "input",
                ["literal", "expression"],
                {
                    dynamicType: (actionType: LVGLSetPropertyActionType) => {
                        const type = actionType.propertyInfo.type;
                        return type == "image"
                            ? PropertyType.ObjectReference
                            : type == "number"
                            ? PropertyType.Number
                            : type == "boolean"
                            ? PropertyType.Boolean
                            : PropertyType.MultilineText;
                    },
                    checkboxStyleSwitch: true,
                    dynamicTypeReferencedObjectCollectionPath: (
                        actionType: LVGLSetPropertyActionType
                    ) => {
                        const type = actionType.propertyInfo.type;
                        return type == "image" ? "bitmaps" : undefined;
                    },
                    displayName: (actionType: LVGLSetPropertyActionType) => {
                        if (actionType.propertyInfo.type == "image") {
                            return "Image";
                        }
                        return "Value";
                    }
                }
            ),
            {
                name: "animated",
                type: PropertyType.Boolean,
                checkboxStyleSwitch: true,
                hideInPropertyGrid: (actionType: LVGLSetPropertyActionType) =>
                    !actionType.propertyInfo.animated
            }
        ],
        defaultValue: {
            targetType: "bar",
            property: "value",
            animated: false,
            valueType: "literal"
        },
        check: (object: LVGLSetPropertyActionType) => {
            let messages: Message[] = [];

            if (!object.target) {
                messages.push(propertyNotSetMessage(object, "target"));
            } else {
                const page = getAncestorOfType(
                    object,
                    ProjectEditor.PageClass.classInfo
                ) as Page;
                const lvglWidgetIndex = page._lvglWidgetIdentifiers.get(
                    object.target
                );
                if (lvglWidgetIndex == undefined) {
                    messages.push(propertyNotFoundMessage(object, "target"));
                } else {
                    const lvglWidget = page._lvglWidgets[lvglWidgetIndex - 1];
                    if (!setPropertyFilterTarget(object, lvglWidget)) {
                        messages.push(
                            new Message(
                                MessageType.ERROR,
                                `Invalid target type`,
                                getChildOfObject(object, "target")
                            )
                        );
                    }
                }
            }

            if (object.propertyInfo.code == PropertyCode.NONE) {
                messages.push(propertyNotSetMessage(object, "property"));
            }

            if (object.valueType == "literal") {
                if (object.propertyInfo.type == "image") {
                    if (object.value) {
                        const bitmap = ProjectEditor.findBitmap(
                            ProjectEditor.getProject(object),
                            object.value
                        );

                        if (!bitmap) {
                            messages.push(
                                propertyNotFoundMessage(object, "value")
                            );
                        }
                    } else {
                        messages.push(propertyNotSetMessage(object, "value"));
                    }
                }
            }

            return messages;
        }
    });

    get propertyInfo() {
        return (
            (PROPERTIES as PropertiesType)[this.targetType][this.property] ?? {
                code: PropertyCode.NONE,
                type: "integer",
                animated: false
            }
        );
    }
    get valueExpr() {
        if (typeof this.value == "number") {
            return this.value.toString();
        }

        if (typeof this.value == "boolean") {
            return this.value ? "true" : "false";
        }

        if (this.valueType == "literal") {
            if (this.propertyInfo.type == "boolean") {
                return this.value ? "true" : "false";
            }
        }

        if (this.valueType == "expression") {
            return this.value as string;
        }

        return escapeCString(this.value ?? "");
    }

    override get actionDescription() {
        let singleItem = (getParent(this) as LVGLActionType[]).length == 1;
        return (
            <>
                {`${singleItem ? "" : "Set property: "}${this.target}.${
                    this.propertyInfo.code != PropertyCode.NONE
                        ? humanize(this.property)
                        : "<not set>"
                }`}
                <LeftArrow />
                {this.valueExpr}
                {this.propertyInfo.animated
                    ? `, Animated=${this.animated ? "On" : "Off"}`
                    : ""}
            </>
        );
    }

    override build(assets: Assets, dataBuffer: DataBuffer) {
        // target
        const page = getAncestorOfType(
            this,
            ProjectEditor.PageClass.classInfo
        ) as Page;
        dataBuffer.writeInt32(
            page._lvglWidgetIdentifiers.get(this.target) ?? -1
        );

        // property
        dataBuffer.writeUint32(this.propertyInfo.code);

        // value
        dataBuffer.writeObjectOffset(() =>
            buildExpression(
                assets,
                dataBuffer,
                getAncestorOfType(
                    this,
                    LVGLActionComponent.classInfo
                ) as LVGLActionComponent,
                this.valueExpr
            )
        );

        // animated
        dataBuffer.writeUint32(this.animated ? 1 : 0);
    }
}

registerClass("LVGLSetPropertyActionType", LVGLSetPropertyActionType);

////////////////////////////////////////////////////////////////////////////////

export class LVGLActionComponent extends ActionComponent {
    actions: LVGLActionType[];

    static classInfo = makeDerivedClassInfo(ActionComponent.classInfo, {
        flowComponentId: COMPONENT_TYPE_LVGLACTION,
        componentPaletteGroupName: "LVGL Actions",
        componentPaletteLabel: "LVGL",
        enabledInComponentPalette: (projectType: ProjectType) =>
            projectType === ProjectType.LVGL,
        label: (component: LVGLActionComponent) => {
            if (component.actions.length == 1) {
                return `LVGL ${humanize(component.actions[0].action)}`;
            }
            return "LVGL";
        },
        properties: [
            {
                name: "actions",
                type: PropertyType.Array,
                typeClass: LVGLActionType,
                propertyGridGroup: specificGroup,
                arrayItemOrientation: "vertical",
                partOfNavigation: false,
                enumerable: false,
                defaultValue: []
            }
        ],
        beforeLoadHook: (object: LVGLActionComponent, objectJs: any) => {
            if (objectJs.action != undefined) {
                if (objectJs.action == "CHANGE_SCREEN") {
                    let action: Partial<LVGLChangeScreenActionType> = {
                        action: objectJs.action
                    };

                    action.screen =
                        objectJs.changeScreenTarget ?? objectJs.screen;
                    action.fadeMode =
                        objectJs.changeScreenFadeMode ?? objectJs.fadeMode;
                    action.speed = objectJs.changeScreenSpeed ?? objectJs.speed;
                    action.delay = objectJs.changeScreenDelay ?? objectJs.delay;

                    objectJs.actions = [action];
                } else if (objectJs.action == "PLAY_ANIMATION") {
                    objectJs.actions = objectJs.animItems.map((item: any) => {
                        let action: Partial<LVGLPlayAnimationActionType> = {
                            action: objectJs.action
                        };

                        action.target = objectJs.animTarget;
                        action.property = item.property;
                        action.start = item.start;
                        action.end = item.end;
                        action.delay = objectJs.animDelay + item.delay;
                        action.time = item.time;
                        action.relative = item.relative;
                        action.instant = item.instant;
                        action.path = item.path;

                        return action;
                    });
                } else if (objectJs.action == "SET_PROPERTY") {
                    let action: Partial<LVGLSetPropertyActionType> = {
                        action: objectJs.action
                    };

                    action.targetType = objectJs.setPropTargetType;
                    action.target = objectJs.setPropTarget;
                    action.property = objectJs.setPropProperty;
                    action.value = objectJs.setPropValue;
                    action.valueType = objectJs.setPropValueType;
                    action.animated = objectJs.setPropAnim;

                    objectJs.actions = [action];
                }

                delete objectJs.screen;
                delete objectJs.changeScreenTarget;
                delete objectJs.fadeMode;
                delete objectJs.changeScreenFadeMode;
                delete objectJs.speed;
                delete objectJs.changeScreenSpeed;
                delete objectJs.delay;
                delete objectJs.changeScreenDelay;

                delete objectJs.animTarget;
                delete objectJs.animDelay;
                delete objectJs.animItems;

                delete objectJs.setPropTargetType;
                delete objectJs.setPropTarget;
                delete objectJs.setPropProperty;
                delete objectJs.setPropAnim;
                delete objectJs.setPropValue;
                delete objectJs.setPropValueType;
            }
        },
        icon: (
            <img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAANgAAADYCAYAAACJIC3tAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABXFSURBVHhe7Z0PbGTVdcY9b7w2K5bsNvWyJWt7vNltaDYBNbJooZTaS6lAwSFFikT/JBBCkia0olEFVZuqStSqatRC06ZNihpQujQhLRWr/HFaopC1vRVspdarNgmku91dPLZLCKSAibfg3fWbft+de7zP9nhmbL8Lnve+n3R87r3z5s+9Pt899755M9O2DgqwIixyNSGyx7rjmyJZLbwPn3Te1cCOHTvO7+jo2BVF0cWVSmUnmrbBOgqF6sOjzXkhNhIWnzFA7L6M4nOI1adQPjYxMTHlbjwHxbYQ882yWoEtPElvb++PwF2PF3kDXtRPoVxiexIKyzohRAtBsT0BG0X8HiiXy4dda5VVCa3Z6GfGilnoBlD4b6L4HtgOtiXgMTSlLNFqUAtmS5eF/wqhfQpC+6KvNy2yhgLr7Oxsn5ubO4tihKz1e/C/DdvC2wDbCV9QrcdiG8XW8HmEeA1wsYmVViW50vIrL0sUjG0T3L/D7pycnByrVs8lnpVoFPhOqUhalyBrPYAn/kn/Qs742/gEyWwlIYksYDHNeKb+YsQ929pda1vbPRDZnb5cN5vVE4S7I7LWu/AED+IJNqFeS1gSlcgyjHMnNBiFZBntEOwXIbQX4FcU2UricHcolUq/BnHdW21yy0EqWMISeSMZ8yxTC0w4x5B4BrE3+x7KNUVGJS6Cey44Zq6bE+KaR7kdJnGJPMJ4N3ERius07E2QxEhfXx/flrLstoilDUWe0IC4fhbl/WzAA/CORa5BYfZEQuQRi30KrQNGkfG93wNsBMtOeDCtGbxzTDXiDo+ivBV2FppymcuLS4i8k9QBV3s8L7F769at583MzHwTZWrKMt2iDObuCC39GVwPjHd0ey6JS4hFLBUZBfU7PT09V8AvWipagT7GAVdBYLeyDEue0BBCLIYioz7o3ckN5KE/pQcLS0UTmBMSDuAbyYQHmEqVvYSojYmMy0KeWbyyVCrdCE/c9osCo1W6u7t/Gv5almG2jpS4hGgMrwZxhTiO73AFn8UoLieiYrF4iz+I6U7CEqI5XBbD6s8lJfhBZLG3sQyLKDBeCrUZ4rrOn8twGQ0mkQmxOtxeDFnsHa4GDVFMzF5U3C6ILLn3EkI0hy0RnXaQqH6BHsROYICf57IriHmQRCbEKvCrPxPYxbt27eJHuSomsEu9J9XdmhBiNTCLUWAx/PYzZ864DyA7gaGhx6c4ouwlWgUGrRmh5z6Ip8ydIa5Z58oseYyVUwWZywmMZWy7uukpMDZuS6S4IE8uRMpYnLqYBRQUyzybx4skeIlfO+KadcY5A9+dhADuQ5bwqca6f0zDfdo/2rt3L68MPo8Vj1OaEBsYBrKLU8Q0hRVBSBTVHPwR+Idg90ZR9Dl4Xh/4NKyIY+39XX6A0uI8NZHxIU1j8JvpbQ8mUYlWwcRlQqGwnob/3TiOLymXy/2Tk5M3wT6M8vvgr2lvb9+LY96BY74Oz5inJd/vTVVkHqctE1hqTyBEQJLiYpZgRrq/o6PjzRDTJ6anp/+b7cBE5OzkyZMzENow7DrU3wV7Hsb7umWlzzqpasCEZgJbkJ0QGxgTlxMaloD8Apr3Hz9+/CX/QWGLY+63ksZ2txfD8Q/DXwabgPE+8xBD6vFvS0UTmBAbnWqaqZ4VZNz+AbLWPfBOOP6bz1bKQmx3ZxP7+/s3QWQn8TjXoP4ijPc3Ea50/1WzNIMJsdFhxDLbMOuMQiQfc63nslRTjI+Pn6HIpqamTuCxPuybKSxoLjV9LSCBiVbACQDm4hXC+Cg9YPZZtSooMrgIGfDv4UdhLosFWClKYKIlYOTbMm4UwuBXWbuMBlsrTk0Q1b0hMpchgYlWwDIY+ar3641dt6xsb28fgcjcWcUQa0QJTLQKFqv/6f16cWI6ceLEs3DfZRlCk8BEbmGscu/EL/kkTZ/YqAP3XoQiIxKYyCd+9caf8qLIUgWZi6f4gyCBiZbAn+HrKBaL/F064hrWicuCEO/rXC0AEphoFexq+T2ulo7A+GVPvCh3t6tUFj4fmRoSmGgFFsQEEfy8L64XF/tRFPFCYIo2yBfsSmCiFeAGzGL1hp07d/4ofPJq+FXT2dlpj/du79fzntqKSGCiVWCscpnYhX0Yf8K4rb+/n5dNrQX3Iye7du0qISN+wLfx8ZXBRC5h4DOL2Wn1j/b29vbbdYW+rVkY8y5bzc/PfwarwvMhMgqX7TpNL3INhUZx8KqLL/X19fUkRNYw+/iPtLgzhxDoJ+HeDnO/IARPcSmDidySzGIURXccx4f5le/+4l27jca4NrO2Nv+RliLEdR/8R2BOrLBgSGCi1aCQmHEolp1RFB0ulUqfgF2EOgVDY5Yys7Y2HPNOiIuXWt3m2xj/JtzUsxcp7N27t2N2dpZfFPIWGJ80qKKFWCcUA6EgkvH6IrLaI1g6HoQ/Cn8KGa69WCxehPLlaHs7/CX+WH6dG3+1NW1x8bH4mvhtVneVy+W7JTDRiiRFthDUbEhQSzg8jjDGk4+RFssEpiWiaEUoChMXsZMXXDbSWLbbrY2B7/ZkyF4hxFUTCUy0MiY0Qs/MRLGZuHjlh7XZfovXNSbvFxQJTGSFpGisTC0l2151JDAhAiKBCREQCUyIgEhgQgTECezcWUshRJo4gRUCfJuOEOLcEvE1OYUpRNaJNm/ezI9K2yUkRNlMiJSIeKk/9mAv+TpRNhMiJWwPxp/YJLxMSxlMiJRwAovj+FuuBvylJRKZEClgJzkOec+6xCVESjiBTU1NPQb3hK+7S/21VBRi/VBQvJyfPz7Gn+Mk7qPWiaWihCbEGqHA3Cn6crn8OWiKv/hn39DDLxKh2IgTWiKrSXRCNIF9PYA7NT8zM/Pwtm3btqJ4BYy3UYCWySyzOZ9RS+L6zTnFZ3MhmoFaiRAy34CeHjeBERPZ1y+44IIDURSdxkH81Qn+moUTG+r0mTQIiV+C4iYUqgpl9xFzeJtgiIQmGrFIYLUCxk50uC9q3L59+y4c/GYI7g2Iu23+9kzA7IR+cUDaUe6C548AvBXWCzMoNIpQIhONYIwwXs59q5RrXo4tDZOXUOUC/pxNsVi8DIL7VVTfC9+BweKXplCEzGw8TCITtWhaYEl4TIRslumgmpub4+Awc1um4tcrXwx3P+xKmBMZjLdLYKIWaxJYHuGEEvmvWqbQHoXj71JJZKIeywSWmf1UysQUl/+xAO7T+BtSz8NYX3q2UYgVkcDqQJHxlzsmJiaeQfWT2IKxmQJT9hJNIYE1YHx83C0TkfK/AHsZRVsiOrUJUQ8JrDFuv4X19FPw/+ZatEwUTSKBNYcbJ2Sww66mZaJokmUCGxoaimBFWOYCiH3yfVvVxJJ4i+K73rOuJaJoyCIRMfiGh4dz8eYyRYa+NrvU45Uc86VS6dpKpfIIypbBMjcJiXXBSbf2+2Cc3RFwlX379r0RQfQ+NF0F4+VDWWIWxt9C+7vR0dHH2WD9ZrkOzHhxT0/PVRg4fjiVF3XoImCxlNoCsyAbHBz8EKp/Dutke8b5DET26yw0IbJlAnOtymBiMcsE5vZbDK6BgYHbccNfwygufhaMB2bRrG+3Y0LZDy9EMLgPmYe49kBxzFyEwccPXXLWpi36WEcLm/XH+kah3Yy+38QJhhMN6k3j33QWoi4MNO4lPgjHwGPQMdCyuARiX2jsm5XZ99+gB3pvS6SOExj4Ge9ZXxSAGcREZn1/K7LYRT6LZbXP4jUiQnB1wPNrAvKGiek82OurxcxOKuI1wmbxJHkIsmQfC/5TzUKkTi2BCSFSwgSmpZEQAVAGEyIgEpgQAZHAhAiIBCZEQCQwIQIigQkREAlMiIBIYEIERAITIiASmBABkcCECIgEJkRAJDAhAiKBCREQCUyIgEhgQgREAhMiIBKYEAGRwIQIiAQmREAkMCECIoEJERAJTIiASGBCBEQCEyIgEpgQAZHAhAiIBCZEQCQwIQIigQkREAlMiIBIYEIERAITIiASmBABkcCECIgEJkRAJDAhAiKBCREQCUyIgEhgQgREAhMiIBKYEAGRwNZIoVDwJSFWRgJbI5VKxZeEWBkJbBVEUTTvi0pfoilMYLmejuM49qUVsfF5AXaGBb9EVBoTdVEGA8hMvlSfYrH4NIT1oq9KXKIhiK2IU3FyyZO3wKkggzVa8rkxOXny5AyOfcI1VGFRiBWJRkZG5uBfrlZzQ1IZZ5GV/s+X6ymmyD849lHvY1hBKhP1sLXRk94zWDibZzlorG9u4wV9TG3ZsmWC5eHh4Xr9dscj438B7hXYJrZRZPASmaiJCWy/9yTLIrM+sX9nXaFQeJDCGhoachmqDrxvcQLA3+1aqo9B4dkSU0ITi4gQWIXR0dGDKFNk7TCeJbPT0QyYLBmhILgs7oQ9gYxkYml4KhG4cZmcnPx9CPMhFDtgnKQoNBMbrdZzZ9FIsiyWsHD6DMuk2+AehjFoOJvbrJwl2Cf2jeJ6EsvD6w8ePPgKJpmowfIwiRuXcrl8E9ydeIxn4Dkx0fjYHNMsjp3BbScnEU42NhEbEtoSiseOHWtjFkOAxVj9PNTX1zeJ9jfAtsEoNgZLVuw07Djs08Vi8ZaRkZEfeHE1k72S8LHaZmZmDnd1dd2HgPs2qrMwBpgJ2E1SuI3btKWvo6WMfaC3foAIbRG9P8aExnZ2mGX3J4cwBjg230B8PL4wCF5kCzPQwMBAL5ZP5/tqVjgdx/HU2NgYhcY+r0VcSSiiRbP47t27Lzx9+vQFGDtOTpkD+tmK4Hkj/KWoXgG7HGZ95TKZmdziKG8iY78ZD+0Yo7uwyrl72QAg6IoIuqWpP1Owj3BxckJZBxxDW2pnetxq0d3dvQfBdAvsDlRfB+HxbY+8iqyxwAxmNLisDU4lJVHVw8Ysy4FV6OzsLMzNzTGY3HhCaN1Ydj8Age1DNZnJsjwOS2leYEI0SaG/v799fHzcXaPZ29s7BvdzsDyKbJnAFs4iCrFGKhQXMhrFxAuneTaab8Qnl4m5RQITqYDl4lmKbHp6mmdpuVRkc+72pEuRwERqQGR2RvaLWCLR87S9a8grEphIE6emKIr+AwL7Hxbhc62wFTeffI/IFzPFOt/3WkZGz7aStZ5x5VhUSqXSKLLXAMpcJvJtkTzA8ap/FlHvgzWHFxbfqM78WK2yj+7NdwhsfxzHNyPQ7GxiHlhZYAwYCziWZ2dnfxwHZeZKDv+hyjnMqhOHDh06xTb0c01XciTvd/XVV2+dn5/vQbEDS6M1C3YD8tLIyMgJFhgP9BYfDTCB3YOx/i2UJbCkuAYGBm7HjR9C8WJY1i73YR/LsH+E/eHo6OgPVysyHO9m9H379l2IAPoYmm6AdbsbswVPtX8H9pcYpwfYkIyTOjiB9fb2/gn8XbB8C8wGDcLqQOMB3Hg9j/Skul/ZAHBCsax9AgK5bmxs7HizIrPjBgcH+1H9GmyHu6E6sI0Cr9VY2INjnD6PcXqPrzZCAksIbGEQ0cDPg1FcvBCWB/FgC8isGKGQ+Hmw3ejzP2Fi2ULRcKJxt66An4hiHP9jqP4zjOLiWJkwlz5Xq5sFyxmM07sxqfwFym6SoW8GCNOX8gtn5AoG71qUfwnG2YYfhecsRGoNfCsboefHSSgy7jM5y5JGgeNux/Efh9sO4/3t4zwk+TxZMMI4YPbhJHIHM7efjJoSGcbKl/KLDVQy/XNULHtlDesT+8eJhNyEgKl7psxnr3me0ED1xmqru79N0VkdK4sDG5tf8T6L/Q2C+8oA+J+oVhcNalaxvpnvPnXqVIkFPxa1cO1xHO+BY/YiSx8ni7BvyXh4i/dZ25sHI0JwcZlzXrWaG5KiaIdwNvtyXbFgT8G3LSzoSN3jM4T1040TtxWuJhoSIbg4WMkBy0vQLNDs+1fYU+QxsHIXD2nS9BkhIcTqMYFplhIiAMpgQgREAhMiIBKYEAGRwIQIiAQmREAkMCECIoEJERAJTIiASGBCBEQCEyIgEpgQAZHAhAiIBCZEQCQwIQIigQkREAlMiIBIYEIERAITIiASmBABkcCECIgEJkRAJDAhAiKBCREQCUyIgEhgQgREAhMiIBKYEAGRwIQIiAQmREAkMCECIoEJERAJTIiASGBCBKAC6CUwIcIwxz8SmBABKBQKz9NLYEKki/3e+TT/SGBCpIPbc4Eitl+z8FOsSGBCpEfMP1EUPVUul59yZf4RQqwLZi8uDV0WQwb7F3pQlMCESAeemXf7r0Kh8BXXAiQwIdaHZa0YwiqieLSrq+sg28C8BCbE+oG2Cm7/BT47Pj5+Bp5iUwYTYh3Y3ovi2gSb3rx589/Ak+oJD1cUIix2CjtLJPtk2evjR48e/SE8s5e7XQITQcCS6WVfzDIF7L24HGxHfx+ZnJy8n22wed5ITGBZnGFSB4PpS6IJvuc9sasbsgCDgMY+nYVtgrieg92KMlnU11oZTFG0AhhEX8oVa4oHTEYnfJExZkHZ6qBbrhsmLmauGG03TkxMPIM6l4a2XHTkdYmY/GdX4njRmKyGLATNamimv9XNfRR9G+4FFmGZEBf/QFAU1xmIqt3Xb8DS8LHOzk7WF5aGRjQ2NnYa/sVqNVfYP517hf+tFlcMBGt/DsaZK2+pzPrvxmloaKjexMxjIz+jP+ZaqqLjmK00vhsZvmaa+59DWNxzcVnI6w2vKZfLX6O45ubmGBfLsIGySzuSA9GKg9EMNliWtr6FSeb7CJrC8PBwzT5b+5YtW47C/RfLoJWDphnYLxsr6+Mh712w1cFu/7T3JPlY9ngbFXuN9pqJm1jBJojsCHw/Mtc364mLmMB47v4VGM/lJ2fojT4QqyE5YBSH9e1T3tddLkOARS80CxouB+zx7LGzgvWFfWM8MC6exVL6ATYCm5xWgmNTQAA+Av+3MFs+LQSi38tspHGr9VrYT2YsjgP7wNf/R1NTU5chcx1DuVhPXKTgA2d+YGDgNqjyPt/OB60bcC0MB42bUfbvs6Ojox+sl71qMTg4eADuRhiDho+X5bGiuMg7MVZfsXjxbfWwiadQKpXuh6BupagQYxTXWXp/zCK88F41/Oswkk/u9lieORz3D7A/xtLXVjD8nzeaaKodxKBFGLQYgXMLqn8F28L2jHM3AuYuX24KEyKDbHZ29l40vb96S6bhvvMDGKsvW5xUm5vCRNYGkV0P8XwExatgnWzbCJjok/g2JpnvwL6EzP3g9PT0cXdjdXJuZoJxLDxyQmQ7UX0vjAPRxds8i19F62CzEl8/32U/ggH8PPZdR9hoomG5GZLHY6yuhPtl2KWw82HJ52pF7PXTfx82AtsPcf1gDeIybCzcY3d3d+9B8F4eRdHb8H/YjaYLUe9EuQL/qo4bhFPB6yjA80LdU2h6Fv4kXgqFdQRL3CfdgVVslbKWMaiCQXQXKOYBBowvrhqKbD33bzVSigs+RitOPOt43W1t/w80aZNoIJlxJgAAAABJRU5ErkJggg==" />
        ),
        componentHeaderColor: "#FBDEDE",
        defaultValue: {
            actions: []
        }
    });

    constructor() {
        super();

        makeObservable(this, {
            actions: observable
        });
    }

    getInputs() {
        return [
            ...super.getInputs(),
            {
                name: "@seqin",
                type: "any" as ValueType,
                isSequenceInput: true,
                isOptionalInput: true
            }
        ];
    }

    getOutputs() {
        return [
            ...super.getOutputs(),
            {
                name: "@seqout",
                type: "null" as ValueType,
                isSequenceOutput: true,
                isOptionalOutput: true
            }
        ];
    }

    getBody(flowContext: IFlowContext): React.ReactNode {
        return (
            <div className="body">
                {this.actions.map((action, i) => (
                    <pre key={getId(action)}>
                        {this.actions.length > 1 ? `#${i + 1} ` : ""}
                        {action.actionDescription}
                    </pre>
                ))}
            </div>
        );
    }

    buildFlowComponentSpecific(assets: Assets, dataBuffer: DataBuffer) {
        dataBuffer.writeArray(this.actions, action => {
            // action
            dataBuffer.writeUint32(LVGL_ACTIONS[action.action]);

            // ...specific
            action.build(assets, dataBuffer);
        });
    }
}

registerClass("LVGLActionComponent", LVGLActionComponent);