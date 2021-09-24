import React from "react";
import { observer } from "mobx-react";
import classNames from "classnames";

import { ITreeNode, Tree } from "eez-studio-ui/tree";

import { ProjectContext } from "project-editor/project/context";
import { Panel } from "project-editor/components/Panel";
import { action, computed, observable, runInAction } from "mobx";
import { FlowTabState } from "project-editor/flow/flow";
import { getId, getLabel } from "project-editor/core/object";
import { HistoryPanel } from "./history";
import { FlowState, QueueTask } from "./runtime";
import { IconAction } from "eez-studio-ui/action";
import { RightArrow } from "./action-components";
import { IColumn, Table } from "eez-studio-ui/table";
import { IDataContext } from "eez-studio-types";
import { Component } from "./component";
import { getFlow } from "project-editor/project/project";

////////////////////////////////////////////////////////////////////////////////

@observer
export class DebuggerPanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="debugger"
                title={"Debugger"}
                buttons={[
                    <IconAction
                        key="resume"
                        icon={
                            <svg viewBox="0 0 500 607.333984375">
                                <path d="M486 278.667c9.333 6.667 14 15.333 14 26 0 9.333-4.667 17.333-14 24l-428 266c-16 10.667-29.667 12.667-41 6-11.333-6.667-17-20-17-40v-514c0-20 5.667-33.333 17-40C28.333 0 42 2 58 12.667l428 266" />
                            </svg>
                        }
                        iconSize={16}
                        title="Resume"
                        onClick={() => this.context.runtimeStore.resume()}
                        enabled={this.context.runtimeStore.isPaused}
                    />,
                    <IconAction
                        key="pause"
                        icon={
                            <svg viewBox="0 0 530 700">
                                <path d="M440 0c60 0 90 21.333 90 64v570c0 44-30 66-90 66s-90-22-90-66V64c0-42.667 30-64 90-64M90 0c60 0 90 21.333 90 64v570c0 44-30 66-90 66S0 678 0 634V64C0 21.333 30 0 90 0" />
                            </svg>
                        }
                        iconSize={16}
                        title="Pause"
                        onClick={() => this.context.runtimeStore.pause()}
                        enabled={!this.context.runtimeStore.isPaused}
                    />,
                    <IconAction
                        key="single-step"
                        icon={
                            <svg viewBox="0 0 43 38">
                                <path d="M10 0h1v5h-1a5 5 0 0 0-5 5v14a5 5 0 0 0 5 5h1v-4l6.75 6.5L11 38v-4h-1C4.477 34 0 29.523 0 24V10C0 4.477 4.477 0 10 0zm7 5h26v5H17V5zm3 8h23v5H20v-5zm-3 8h26v5H17v-5z" />
                            </svg>
                        }
                        iconSize={18}
                        style={{ marginTop: 4 }}
                        title="Single step"
                        onClick={() =>
                            this.context.runtimeStore.runSingleStep()
                        }
                        enabled={this.context.runtimeStore.isPaused}
                    />,
                    <IconAction
                        key="restart"
                        icon={
                            <svg
                                viewBox="0 0 24 24"
                                strokeWidth="2"
                                stroke="currentColor"
                                fill="none"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <path
                                    stroke="none"
                                    d="M0 0h24v24H0z"
                                    fill="none"
                                ></path>
                                <path d="M4.05 11a8 8 0 1 1 .5 4m-.5 5v-5h5"></path>
                            </svg>
                        }
                        iconSize={18}
                        style={{ marginTop: 4 }}
                        title="Restart"
                        onClick={async () => {
                            await this.context.runtimeStore.setEditorMode();
                            await this.context.runtimeStore.setRuntimeMode(
                                true
                            );
                        }}
                        enabled={this.context.runtimeStore.isPaused}
                    />
                ]}
                body={
                    this.context.runtimeStore.isPaused ? (
                        <div className="EezStudio_DebuggerPanel">
                            <QueuePanel />
                            <VariablesPanel />
                            <BreakpointsPanel />
                            <FlowStatesPanel />
                            <HistoryPanel />
                        </div>
                    ) : (
                        <div />
                    )
                }
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class QueuePanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="project-editor/debugger/queue"
                title="Queue"
                collapsable={true}
                body={<QueueList />}
            />
        );
    }
}

@observer
class QueueList extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    @computed get rootNode(): ITreeNode<QueueTask> {
        function getQueueTaskLabel(queueTask: QueueTask) {
            if (
                queueTask.connectionLine &&
                queueTask.connectionLine.sourceComponent &&
                queueTask.connectionLine.targetComponent
            ) {
                return (
                    <div>
                        {`${getLabel(
                            queueTask.connectionLine.sourceComponent
                        )}:${queueTask.connectionLine.output}`}
                        <RightArrow />{" "}
                        {`${getLabel(
                            queueTask.connectionLine.targetComponent
                        )}:${queueTask.connectionLine.input}`}
                    </div>
                );
            } else {
                return <div>{getLabel(queueTask.component)}</div>;
            }
        }

        function getChildren(queueTasks: QueueTask[]): ITreeNode<QueueTask>[] {
            return queueTasks.map(queueTask => ({
                id: queueTask.id.toString(),
                label: getQueueTaskLabel(queueTask),
                children: [],
                selected: queueTask == selectedQueueTask,
                expanded: false,
                data: queueTask
            }));
        }

        const selectedQueueTask = this.context.runtimeStore.selectedQueueTask;

        return {
            id: "root",
            label: "",
            children: getChildren(this.context.runtimeStore.queue),
            selected: false,
            expanded: true
        };
    }

    @action.bound
    selectNode(node?: ITreeNode<QueueTask>) {
        const queueTask = node && node.data;

        this.context.runtimeStore.selectQueueTask(queueTask);

        if (queueTask) {
            this.context.runtimeStore.showQueueTask(queueTask);
        }
    }

    render() {
        return (
            <Tree
                showOnlyChildren={true}
                rootNode={this.rootNode}
                selectNode={this.selectNode}
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class VariablesPanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="project-editor/debugger/variables"
                title="Variables"
                collapsable={true}
                body={<VariablesTable />}
            />
        );
    }
}

@observer
class VariablesTable extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    @computed
    get columns() {
        let result: IColumn[] = [];

        result.push({
            name: "name",
            title: "Name",
            sortEnabled: true
        });

        result.push({
            name: "scope",
            title: "Scope",
            sortEnabled: true
        });
        result.push({
            name: "value",
            title: "Value",
            sortEnabled: true
        });

        return result;
    }

    @computed
    get rows() {
        function variableValueToString(variable: any) {
            if (variable === undefined) {
                return "undefined";
            }
            try {
                return JSON.stringify(variable);
            } catch (err) {
                try {
                    return variable.toString();
                } catch (err) {
                    return "err!";
                }
            }
        }

        const flowState = this.context.runtimeStore.selectedFlowState;

        let dataContext: IDataContext;
        if (flowState) {
            dataContext = flowState.dataContext;
        } else {
            dataContext = this.context.dataContext;
        }

        const globalVariables =
            this.context.project.variables.globalVariables.map(variable => ({
                id: `global/${variable.name}`,
                selected: false,
                name: variable.name,
                scope: "Global",
                value: variableValueToString(dataContext.get(variable.name))
            }));

        if (!flowState) {
            return globalVariables;
        }

        const localVariables = flowState.flow.localVariables.map(variable => ({
            id: `local/${variable.name}`,
            selected: false,
            name: variable.name,
            scope: "Local",
            value: variableValueToString(dataContext.get(variable.name))
        }));

        return [...globalVariables, ...localVariables];
    }

    render() {
        return (
            <Table
                className="EezStudio_DebuggerVariablesTable"
                persistId="project-editor/debugger/variables/table"
                columns={this.columns}
                rows={this.rows}
                defaultSortColumn="name"
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class BreakpointsPanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="project-editor/debugger/breakpoints"
                title="Breakpoints"
                collapsable={true}
                body={<BreakpointsList />}
            />
        );
    }
}

@observer
class BreakpointsList extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    @observable selectedBreakpoint: Component | undefined;

    @computed get rootNode(): ITreeNode<QueueTask> {
        let children = [...this.context.runtimeStore.breakpoints.keys()].map(
            component => ({
                id: getId(component),
                label: `${getLabel(getFlow(component))}/${getLabel(component)}`,
                children: [],
                selected: component == this.selectedBreakpoint,
                expanded: false,
                data: component
            })
        );

        return {
            id: "root",
            label: "",
            children,
            selected: false,
            expanded: true
        };
    }

    @action.bound
    selectNode(node?: ITreeNode<Component>) {
        const component = node && node.data;

        this.selectedBreakpoint = component;

        if (component) {
            this.context.runtimeStore.showComponent(component);
        }
    }

    render() {
        return (
            <Tree
                showOnlyChildren={true}
                rootNode={this.rootNode}
                selectNode={this.selectNode}
            />
        );
    }
}

////////////////////////////////////////////////////////////////////////////////

@observer
class FlowStatesPanel extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    render() {
        return (
            <Panel
                id="project-editor/debugger/flows"
                title="Active flows"
                collapsable={true}
                body={<FlowsTree />}
            />
        );
    }
}

@observer
class FlowsTree extends React.Component {
    static contextType = ProjectContext;
    declare context: React.ContextType<typeof ProjectContext>;

    @computed get rootNode(): ITreeNode<FlowState> {
        const selectedFlowState = this.context.runtimeStore.selectedFlowState;

        function getChildren(flowStates: FlowState[]): ITreeNode<FlowState>[] {
            return flowStates.map(flowState => ({
                id: flowState.id,
                label: (
                    <div
                        className={classNames("running-flow", {
                            error: flowState.hasError
                        })}
                    >
                        {getLabel(flowState.flow)}
                    </div>
                ),
                children: getChildren(flowState.flowStates),
                selected: flowState === selectedFlowState,
                expanded: true,
                data: flowState
            }));
        }

        return {
            id: "all",
            label: "All",
            children: getChildren(this.context.runtimeStore.flowStates),
            selected: !selectedFlowState,
            expanded: true
        };
    }

    @action.bound
    selectNode(node?: ITreeNode<FlowState>) {
        this.context.runtimeStore.historyState.selectedHistoryItem = undefined;

        const flowState = node?.data;

        this.context.runtimeStore.selectedFlowState = flowState;

        if (flowState) {
            this.context.navigationStore.showObject(flowState.flow);

            const editorState = this.context.editorsStore.activeEditor?.state;
            if (editorState instanceof FlowTabState) {
                setTimeout(() => {
                    runInAction(() => (editorState.flowState = flowState));
                }, 0);
            }
        }
    }

    render() {
        return (
            <Tree
                showOnlyChildren={false}
                rootNode={this.rootNode}
                selectNode={this.selectNode}
            />
        );
    }
}