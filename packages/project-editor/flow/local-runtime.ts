import { action, computed, observable, runInAction, toJS } from "mobx";
import { DocumentStoreClass } from "project-editor/core/store";
import { findAction } from "project-editor/features/action/action";
import { FlowTabState } from "project-editor/flow/flow";
import { Component, Widget } from "project-editor/flow/component";
import { IEezObject } from "project-editor/core/object";
import type { IFlowContext } from "project-editor/flow/flow-interfaces";
import { isWebStudio } from "eez-studio-shared/util-electron";
import {
    ExecuteWidgetActionLogItem,
    WidgetActionNotDefinedLogItem,
    WidgetActionNotFoundLogItem
} from "project-editor/flow/debugger/logs";
import { getCustomTypeClassFromType } from "project-editor/features/variable/variable";
import * as notification from "eez-studio-ui/notification";
import {
    StateMachineAction,
    FlowState,
    QueueTask,
    RuntimeBase
} from "project-editor/flow/runtime";

export class LocalRuntime extends RuntimeBase {
    pumpTimeoutId: any;
    @observable settings: any = {};
    _settingsModified: boolean = false;
    _lastBreakpointTaks: QueueTask | undefined;

    constructor(public DocumentStore: DocumentStoreClass) {
        super(DocumentStore);
    }

    doStartRuntime = async (isDebuggerActive: boolean) => {
        runInAction(() => {
            this.DocumentStore.dataContext.clearRuntimeValues();

            this.flowStates = this.DocumentStore.project.pages
                .filter(page => !page.isUsedAsCustomWidget)
                .map(page => new FlowState(this, page));
        });

        await this.loadSettings();

        await this.loadPersistentVariables();

        runInAction(() => {
            this.globalVariablesInitialized = true;
        });

        await this.constructCustomGlobalVariables();

        for (const flowState of this.flowStates) {
            await flowState.start();
        }
        this.pumpQueue();

        EEZStudio.electron.ipcRenderer.send("preventAppSuspension", true);

        if (isDebuggerActive) {
            this.transition(StateMachineAction.PAUSE);
        } else {
            this.transition(StateMachineAction.RUN);
        }

        if (this.isPaused) {
            this.showNextQueueTask();
        }

        if (!this.isStopped) {
            notification.success(`Flow started`, {
                autoClose: 1000
            });
        }
    };

    async loadPersistentVariables() {
        if (this.settings.__persistentVariables) {
            for (const variable of this.DocumentStore.project.variables
                .globalVariables) {
                if (variable.persistent) {
                    const saveValue =
                        this.settings.__persistentVariables[variable.name];
                    if (saveValue) {
                        const aClass = getCustomTypeClassFromType(
                            variable.type
                        );
                        if (aClass && aClass.classInfo.onVariableLoad) {
                            const value = await aClass.classInfo.onVariableLoad(
                                saveValue
                            );
                            this.DocumentStore.dataContext.set(
                                variable.name,
                                value
                            );
                        }
                    }
                }
            }
        }
    }

    async savePersistentVariables() {
        for (const variable of this.DocumentStore.project.variables
            .globalVariables) {
            if (variable.persistent) {
                const aClass = getCustomTypeClassFromType(variable.type);
                if (aClass && aClass.classInfo.onVariableSave) {
                    const saveValue = await aClass.classInfo.onVariableSave(
                        this.DocumentStore.dataContext.get(variable.name)
                    );

                    runInAction(() => {
                        if (!this.settings.__persistentVariables) {
                            this.settings.__persistentVariables = {};
                        }
                        this.settings.__persistentVariables[variable.name] =
                            saveValue;
                    });
                    this._settingsModified = true;
                }
            }
        }
    }

    async constructCustomGlobalVariables() {
        for (const variable of this.DocumentStore.project.variables
            .globalVariables) {
            let value = this.DocumentStore.dataContext.get(variable.name);
            if (value == null) {
                const aClass = getCustomTypeClassFromType(variable.type);
                if (aClass && aClass.classInfo.onVariableConstructor) {
                    value = await aClass.classInfo.onVariableConstructor(
                        variable
                    );
                    this.DocumentStore.dataContext.set(variable.name, value);
                }
            }
        }
    }

    @computed get isAnyFlowStateRunning() {
        return (
            this.flowStates.find(flowState => flowState.isRunning) != undefined
        );
    }

    async doStopRuntime(notifyUser = false) {
        await this.saveSettings();

        if (this.pumpTimeoutId) {
            clearTimeout(this.pumpTimeoutId);
            this.pumpTimeoutId = undefined;
        }

        let startTime = Date.now();
        while (this.isAnyFlowStateRunning) {
            await new Promise(resolve => setTimeout(resolve));
            if (Date.now() - startTime > 3000) {
                break;
            }
        }

        this.flowStates.forEach(flowState => flowState.finish());
        EEZStudio.electron.ipcRenderer.send("preventAppSuspension", false);

        if (notifyUser) {
            if (this.error) {
                notification.error(`Flow stopped with error: ${this.error}`);
            } else {
                notification.success("Flow stopped", {
                    autoClose: 1000
                });
            }
        }
    }

    toggleDebugger() {
        if (this.isDebuggerActive) {
            this.transition(StateMachineAction.RUN);
        } else {
            this.transition(StateMachineAction.PAUSE);
        }
    }

    @action
    resume() {
        this.transition(StateMachineAction.RESUME);
    }

    @action
    pause() {
        this.transition(StateMachineAction.PAUSE);
    }

    @action
    runSingleStep() {
        this.transition(StateMachineAction.SINGLE_STEP);
    }

    pumpQueue = async () => {
        this.pumpTimeoutId = undefined;

        if (!(this.isDebuggerActive && this.isPaused)) {
            if (this.queue.length > 0) {
                const runningComponents: QueueTask[] = [];

                let singleStep = this.isSingleStep;

                const queueLength = this.queue.length;

                for (let i = 0; i < queueLength; i++) {
                    let task: QueueTask | undefined;
                    runInAction(() => (task = this.queue.shift()));
                    if (!task) {
                        break;
                    }

                    const { flowState, component, connectionLine } = task;

                    const componentState =
                        flowState.getComponentState(component);

                    if (componentState.isRunning) {
                        runningComponents.push(task);
                    } else {
                        if (
                            this.DocumentStore.uiStateStore.breakpoints.has(
                                component
                            )
                        ) {
                            if (
                                this.isDebuggerActive &&
                                !singleStep &&
                                task != this._lastBreakpointTaks
                            ) {
                                this._lastBreakpointTaks = task;
                                runningComponents.push(task);
                                singleStep = true;
                                break;
                            }
                        }

                        this._lastBreakpointTaks = undefined;

                        await componentState.run();

                        if (connectionLine) {
                            connectionLine.setActive();
                        }
                    }

                    if (singleStep) {
                        break;
                    }

                    if (this.isDebuggerActive && this.isPaused) {
                        break;
                    }
                }

                runInAction(() => this.queue.unshift(...runningComponents));

                if (singleStep) {
                    this.transition(StateMachineAction.PAUSE);
                }
            }
        }

        if (!this.isStopped) {
            this.pumpTimeoutId = setTimeout(this.pumpQueue);
        }
    };

    @action
    executeWidgetAction(flowContext: IFlowContext, widget: Widget) {
        if (this.isStopped) {
            return;
        }

        const parentFlowState = flowContext.flowState! as FlowState;

        if (widget.isOutputProperty("action")) {
            parentFlowState.propagateValue(widget, "action", null);
        } else if (widget.action) {
            // execute action given by name
            const action = findAction(
                this.DocumentStore.project,
                widget.action
            );

            if (action) {
                const newFlowState = new FlowState(
                    this,
                    action,
                    parentFlowState
                );

                this.logs.addLogItem(
                    new ExecuteWidgetActionLogItem(newFlowState, widget)
                );

                parentFlowState.flowStates.push(newFlowState);

                newFlowState.executeStartAction();
            } else {
                this.logs.addLogItem(
                    new WidgetActionNotFoundLogItem(undefined, widget)
                );
            }
        } else {
            this.logs.addLogItem(
                new WidgetActionNotDefinedLogItem(undefined, widget)
            );
        }
    }

    removeFlowState(flowState: FlowState) {
        let flowStates: FlowState[];
        if (flowState.parentFlowState) {
            flowStates = flowState.parentFlowState.flowStates;
        } else {
            flowStates = this.flowStates;
        }

        const i = flowStates.indexOf(flowState);

        if (i == -1) {
            console.error("UNEXPECTED!");
            return;
        }

        runInAction(() => {
            flowStates.splice(i, 1);
        });
    }

    readSettings(key: string) {
        return this.settings[key];
    }

    @action
    writeSettings(key: string, value: any) {
        this.settings[key] = value;
        this._settingsModified = true;
    }

    getSettingsFilePath() {
        if (this.DocumentStore.filePath) {
            return this.DocumentStore.filePath + "-runtime-settings";
        }
        return undefined;
    }

    async loadSettings() {
        if (isWebStudio()) {
            return;
        }

        const filePath = this.getSettingsFilePath();
        if (!filePath) {
            return;
        }

        const fs = EEZStudio.remote.require("fs");

        return new Promise<void>(resolve => {
            fs.readFile(filePath, "utf8", (err: any, data: string) => {
                if (err) {
                    // TODO
                    console.error(err);
                } else {
                    runInAction(() => {
                        try {
                            this.settings = JSON.parse(data);
                        } catch (err) {
                            console.error(err);
                            this.settings = {};
                        }
                    });
                    console.log("Runtime settings loaded");
                }
                resolve();
            });
        });
    }

    async saveSettings() {
        if (isWebStudio()) {
            return;
        }

        const filePath = this.getSettingsFilePath();
        if (!filePath) {
            return;
        }

        if (this.globalVariablesInitialized) {
            await this.savePersistentVariables();
        }

        if (!this._settingsModified) {
            return;
        }

        const fs = EEZStudio.remote.require("fs");

        return new Promise<void>(resolve => {
            fs.writeFile(
                this.getSettingsFilePath(),
                JSON.stringify(toJS(this.settings), undefined, "  "),
                "utf8",
                (err: any) => {
                    if (err) {
                        // TODO
                        console.error(err);
                    } else {
                        this._settingsModified = false;
                        console.log("Runtime settings saved");
                    }

                    resolve();
                }
            );
        });
    }

    selectQueueTask(queueTask: QueueTask | undefined) {
        this.selectedQueueTask = queueTask;
        if (queueTask) {
            this.selectedFlowState = queueTask.flowState;
            this.showSelectedFlowState();
        }
    }

    showSelectedFlowState() {
        const flowState = this.selectedFlowState;
        if (flowState) {
            this.DocumentStore.navigationStore.showObject(flowState.flow);

            const editorState =
                this.DocumentStore.editorsStore.activeEditor?.state;
            if (editorState instanceof FlowTabState) {
                setTimeout(() => {
                    runInAction(() => (editorState.flowState = flowState));
                }, 0);
            }
        }
    }

    showComponent(component: Component) {
        this.DocumentStore.navigationStore.showObject(component);

        const editorState = this.DocumentStore.editorsStore.activeEditor?.state;
        if (editorState instanceof FlowTabState) {
            editorState.ensureSelectionVisible();
        }
    }

    showQueueTask(queueTask: QueueTask) {
        const objects: IEezObject[] = [];

        if (
            queueTask.connectionLine &&
            queueTask.connectionLine.sourceComponent &&
            queueTask.connectionLine.targetComponent
        ) {
            objects.push(queueTask.connectionLine.sourceComponent);
            objects.push(queueTask.connectionLine);
            objects.push(queueTask.connectionLine.targetComponent);
        } else {
            objects.push(queueTask.component);
        }

        // navigate to the first object,
        // just to make sure that proper editor is opened
        this.DocumentStore.navigationStore.showObject(objects[0]);

        const editorState = this.DocumentStore.editorsStore.activeEditor?.state;
        if (editorState instanceof FlowTabState) {
            // select other object in the same editor
            editorState.selectObjects(objects);

            // ensure objects are visible on the screen
            editorState.ensureSelectionVisible();
        }
    }

    onBreakpointAdded(component: Component) {}

    onBreakpointRemoved(component: Component) {}

    onBreakpointEnabled(component: Component) {}

    onBreakpointDisabled(component: Component) {}
}