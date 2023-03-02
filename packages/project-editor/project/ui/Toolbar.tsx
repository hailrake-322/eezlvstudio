import React from "react";
import { action, makeObservable } from "mobx";
import { observer } from "mobx-react";
import classNames from "classnames";
import { startSearch } from "project-editor/core/search";
import { ButtonAction, IconAction } from "eez-studio-ui/action";
import { BuildConfiguration } from "project-editor/project/project";
import { ProjectContext } from "project-editor/project/context";
import {
    getObjectVariableTypeFromType,
    IObjectVariableValue
} from "project-editor/features/variable/value-type";
import { PageTabState } from "project-editor/features/page/PageEditor";
import { LayoutModels, objectToString } from "project-editor/store";
import { RenderVariableStatus } from "project-editor/features/variable/variable";
import { FlowTabState } from "project-editor/flow/flow-tab-state";
import { RuntimeType } from "project-editor/project/project-type-traits";

const RUN_ICON = (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24"
        height="24"
        viewBox="0 0 24 24"
        strokeWidth="2"
        stroke="currentColor"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <path stroke="none" d="M0 0h24v24H0z" fill="none"></path>
        <circle cx="13" cy="4" r="1"></circle>
        <path d="M4 17l5 1l.75 -1.5"></path>
        <path d="M15 21l0 -4l-4 -3l1 -6"></path>
        <path d="M7 12l0 -3l5 -1l3 3l3 1"></path>
    </svg>
);

export const Toolbar = observer(
    class Toolbar extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            return (
                <nav className="navbar justify-content-between EezStudio_ToolbarNav">
                    {!this.context.project._isDashboardBuild &&
                    !(
                        this.context.runtime &&
                        !this.context.runtime.isDebuggerActive
                    ) ? (
                        <Controls />
                    ) : (
                        <div />
                    )}

                    {!this.context.project._isDashboardBuild &&
                    this.context.projectTypeTraits.runtimeType !=
                        RuntimeType.NONE ? (
                        <RunEditSwitchControls />
                    ) : (
                        <div />
                    )}

                    {this.context.runtime ? (
                        <GlobalVariableStatuses />
                    ) : (
                        <Search />
                    )}
                </nav>
            );
        }
    }
);

const GlobalVariableStatuses = observer(
    class GlobalVariableStatuses extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            let globalVariablesStatus: React.ReactNode[] = [];

            for (const variable of this.context.project.allGlobalVariables) {
                const objectVariableType = getObjectVariableTypeFromType(
                    variable.type
                );
                if (objectVariableType) {
                    const objectVariableValue:
                        | IObjectVariableValue
                        | undefined = this.context.dataContext.get(
                        variable.name
                    );

                    globalVariablesStatus.push(
                        <RenderVariableStatus
                            key={variable.name}
                            variable={variable}
                            value={objectVariableValue}
                            onClick={async () => {
                                if (objectVariableType.editConstructorParams) {
                                    const constructorParams =
                                        await objectVariableType.editConstructorParams(
                                            variable,
                                            objectVariableValue?.constructorParams
                                        );
                                    if (constructorParams !== undefined) {
                                        this.context.dataContext.set(
                                            variable.name,
                                            objectVariableType.createValue(
                                                constructorParams,
                                                !!this.context.runtime
                                            )
                                        );
                                    }
                                }
                            }}
                        />
                    );
                }
            }

            return (
                <div
                    className="EezStudio_FlowRuntimeControls"
                    style={{ width: 0, justifyContent: "flex-end" }}
                >
                    {globalVariablesStatus}
                </div>
            );
        }
    }
);

const Controls = observer(
    class Controls extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        setFrontFace = action((enabled: boolean) => {
            if (this.pageTabState) {
                this.pageTabState.frontFace = enabled;
            }
        });

        get pageTabState() {
            const editorState = this.context.editorsStore.activeEditor?.state;
            if (editorState instanceof PageTabState) {
                return editorState as PageTabState;
            }
            return undefined;
        }

        get flowTabState() {
            const editorState = this.context.editorsStore.activeEditor?.state;
            if (editorState instanceof FlowTabState) {
                return editorState as FlowTabState;
            }
            return undefined;
        }

        get isBuildConfigurationSelectorVisible() {
            return false;
        }

        onSelectedBuildConfigurationChange(event: any) {
            this.context.uiStateStore.setSelectedBuildConfiguration(
                event.target.value
            );
        }

        toggleShowTimeline = action(() => {
            if (this.pageTabState) {
                this.pageTabState.timeline.isEditorActive =
                    !this.pageTabState.timeline.isEditorActive;
            }
        });

        get isShowTimeline() {
            if (this.pageTabState) {
                return this.pageTabState.timeline.isEditorActive;
            }
            return false;
        }

        render() {
            let configurations =
                this.context.project.settings.build.configurations.map(
                    (item: BuildConfiguration) => {
                        return (
                            <option key={item.name} value={item.name}>
                                {objectToString(item)}
                            </option>
                        );
                    }
                );

            return (
                <div
                    style={{
                        width: 0,
                        justifyContent: "flex-start",
                        display: "flex"
                    }}
                >
                    {!this.context.runtime && (
                        <div className="btn-group" role="group">
                            <IconAction
                                title="Save"
                                icon="material:save"
                                onClick={() => this.context.save()}
                                enabled={this.context.isModified}
                            />
                        </div>
                    )}

                    {!this.context.runtime && (
                        <div className="btn-group" role="group">
                            <IconAction
                                title={
                                    this.context.undoManager.canUndo
                                        ? `Undo "${this.context.undoManager.undoDescription}"`
                                        : ""
                                }
                                icon="material:undo"
                                onClick={() => this.context.undoManager.undo()}
                                enabled={this.context.undoManager.canUndo}
                            />
                            <IconAction
                                title={
                                    this.context.undoManager.canRedo
                                        ? `Redo "${this.context.undoManager.redoDescription}"`
                                        : ""
                                }
                                icon="material:redo"
                                onClick={() => this.context.undoManager.redo()}
                                enabled={this.context.undoManager.canRedo}
                            />
                        </div>
                    )}

                    {!this.context.runtime &&
                        this.isBuildConfigurationSelectorVisible && (
                            <div className="btn-group">
                                <select
                                    title="Configuration"
                                    id="btn-toolbar-configuration"
                                    className="form-select"
                                    value={
                                        this.context.uiStateStore
                                            .selectedBuildConfiguration
                                    }
                                    onChange={this.onSelectedBuildConfigurationChange.bind(
                                        this
                                    )}
                                >
                                    {configurations}
                                </select>
                            </div>
                        )}

                    {!this.context.runtime && (
                        <div className="btn-group" role="group">
                            {!this.context.projectTypeTraits.isDashboard && (
                                <IconAction
                                    title="Check"
                                    icon="material:check"
                                    onClick={() => this.context.check()}
                                    enabled={this.context.project._fullyLoaded}
                                />
                            )}
                            <IconAction
                                title="Build"
                                icon="material:build"
                                onClick={() => this.context.build()}
                                enabled={this.context.project._fullyLoaded}
                            />
                        </div>
                    )}

                    {this.context.projectTypeTraits.isResource &&
                        this.context.project.micropython && (
                            <div className="btn-group" role="group">
                                <IconAction
                                    title="Run MicroPython Script"
                                    icon={RUN_ICON}
                                    iconSize={28}
                                    onClick={() =>
                                        this.context.project.micropython.runScript()
                                    }
                                    enabled={this.context.project._fullyLoaded}
                                />
                            </div>
                        )}

                    {this.context.projectTypeTraits.hasFlowSupport && (
                        <>
                            {this.pageTabState && (
                                <>
                                    <div className="btn-group" role="group">
                                        <IconAction
                                            title="Show front face"
                                            icon="material:flip_to_front"
                                            iconSize={20}
                                            onClick={() =>
                                                this.setFrontFace(true)
                                            }
                                            selected={
                                                this.pageTabState.frontFace
                                            }
                                        />
                                        <IconAction
                                            title="Show back face"
                                            icon="material:flip_to_back"
                                            iconSize={20}
                                            onClick={() =>
                                                this.setFrontFace(false)
                                            }
                                            selected={
                                                !this.pageTabState.frontFace
                                            }
                                        />
                                    </div>

                                    {!this.flowTabState?.flowState && (
                                        <div className="btn-group" role="group">
                                            <IconAction
                                                title="Show timeline"
                                                icon={
                                                    <svg viewBox="0 0 551 372">
                                                        <path d="M42.4631 336.4972H204.996v-42.4224h-65.4195v-60.132h65.4195v-42.4495H0l.0008 145.005zm-.0045-102.5747H99.046v60.132H42.4586zm233.9184-42.4632v42.4405h61.8929v60.132h-61.893v42.4405h61.352l42.4247.009h171.5298v-145.013zM442.0555 294.007h-61.893v-60.132h61.893zm67.1986 0h-24.74v-60.132h24.74z" />
                                                        <path d="M348.4318 42.4321c0-10.8489-4.1291-21.7155-12.4228-30.0003C327.7332 4.138 316.8667.009 306.0177.009L176.8741 0c-10.849 0-21.7243 4.129-30.0185 12.4227-8.2757 8.2937-12.7264 19.1555-12.4227 30.0004v53.5542l85.791 54.0862v221.6388h42.4495V150.0637l85.7751-54.0861.009-53.5362z" />
                                                    </svg>
                                                }
                                                iconSize={24}
                                                onClick={() =>
                                                    this.toggleShowTimeline()
                                                }
                                                selected={this.isShowTimeline}
                                            />
                                        </div>
                                    )}
                                </>
                            )}

                            {(this.flowTabState ||
                                (this.pageTabState &&
                                    !this.pageTabState.frontFace)) && (
                                <div className="btn-group" role="group">
                                    <IconAction
                                        title="Show component descriptions"
                                        icon="material:comment"
                                        iconSize={20}
                                        onClick={action(
                                            () =>
                                                (this.context.uiStateStore.showComponentDescriptions =
                                                    !this.context.uiStateStore
                                                        .showComponentDescriptions)
                                        )}
                                        selected={
                                            this.context.uiStateStore
                                                .showComponentDescriptions
                                        }
                                    />
                                </div>
                            )}
                        </>
                    )}

                    {!this.context.runtime &&
                        this.context.project.texts?.languages.length > 0 && (
                            <div className="btn-group" role="group">
                                <SelectLanguage />
                            </div>
                        )}
                </div>
            );
        }
    }
);

const RunEditSwitchControls = observer(
    class RunEditSwitchControls extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            const iconSize = 30;
            return (
                <div className="d-flex">
                    <ButtonAction
                        text="Edit"
                        title="Enter edit mode"
                        icon="material:mode_edit"
                        iconSize={iconSize}
                        onClick={this.context.onSetEditorMode}
                        selected={!this.context.runtime}
                    />

                    <ButtonAction
                        text="Run"
                        title="Enter run mode"
                        icon={RUN_ICON}
                        iconSize={iconSize}
                        onClick={this.context.onSetRuntimeMode}
                        selected={
                            this.context.runtime &&
                            !this.context.runtime.isDebuggerActive
                        }
                    />

                    <ButtonAction
                        text="Debug"
                        title="Enter debug mode"
                        icon={
                            <svg viewBox="0 0 64 64" fill="currentColor">
                                <g transform="translate(-1,-1)">
                                    <path
                                        id="path2"
                                        d="m64 32h-3c-0.5-13.4-10.8-24.9-24.1-26.7-1-0.2-1.9-0.2-2.9-0.3v-3c0-0.6-0.4-1-1-1s-1 0.4-1 1v3c-6.5 0.2-12.7 2.7-17.6 7.1-5.7 5.1-9.1 12.3-9.4 19.9h-3c-0.6 0-1 0.4-1 1s0.4 1 1 1h3c0.5 13.4 10.8 24.9 24.1 26.7 1 0.1 1.9 0.2 2.9 0.2v3c0 0.6 0.4 1 1 1s1-0.4 1-1v-3c6.5-0.2 12.7-2.7 17.6-7.1 5.7-5.1 9.1-12.3 9.4-19.9h3c0.6 0 1-0.4 1-1s-0.4-0.9-1-0.9zm-13.7 20.4c-4.5 4-10.3 6.3-16.3 6.6v-3c0-0.6-0.4-1-1-1s-1 0.4-1 1v3c-0.9 0-1.7-0.1-2.6-0.2-12.4-1.7-21.9-12.3-22.4-24.8h3c0.6 0 1-0.4 1-1s-0.4-1-1-1h-3c0.3-7.1 3.4-13.7 8.7-18.4 4.6-4.1 10.3-6.3 16.3-6.5v2.9c0 0.6 0.4 1 1 1s1-0.4 1-1v-3c0.9 0 1.8 0.1 2.6 0.2 12.4 1.8 21.9 12.4 22.4 24.8h-3c-0.6 0-1 0.4-1 1s0.4 1 1 1h3c-0.3 7.1-3.4 13.7-8.7 18.4z"
                                    />
                                    <g>
                                        <g transform="matrix(1.237 0 0 1.2197 -7.8175 -7.1947)">
                                            <g>
                                                <g transform="matrix(.92683 0 0 .92683 2.4138 2.3964)">
                                                    <path d="m27.4 18.3c1.2 0 2.4 0.5 3.2 1.4-2 0.9-3.2 3-3.3 5.1-0.1 2.6 1.7 4.9 5.7 4.9 4.1 0 5.7-2 5.7-4.6 0-2.4-1.3-4.6-3.3-5.5 0.9-0.9 2-1.4 3.2-1.4 0.5 0 0.9-0.4 0.9-0.9s-0.4-0.9-0.9-0.9c-2.1 0-3.9 1-5.2 2.7h-0.8c-1.2-1.7-3.1-2.7-5.2-2.7-0.5 0-0.9 0.4-0.9 0.9 0 0.6 0.4 1 0.9 1z" />
                                                    <path d="m47.9 45.4c0.3 0.4 0.1 1-0.3 1.3s-1 0.1-1.3-0.3l-1.8-3h-2.9c-1.3 2.7-3.3 4.8-5.8 5.7l-2.8-13.2-2.9 13.1c-2.5-0.9-4.6-3-5.8-5.7h-2.9l-1.8 3c-0.3 0.4-0.8 0.6-1.3 0.3-0.4-0.3-0.6-0.8-0.3-1.3l2.1-3.4c0.2-0.3 0.5-0.5 0.8-0.5h2.7c-0.4-1.2-0.6-2.6-0.6-4 0-0.4 0-0.9 0.1-1.3h-1.7l-1.8 3c-0.3 0.4-0.8 0.6-1.3 0.3s-0.6-0.8-0.3-1.3l2.1-3.5c0.2-0.3 0.5-0.4 0.8-0.4h2.5c0.5-2.3 1.6-4.3 3.1-5.9 1.5 2.4 3.7 3.1 6.5 3.1 2.7 0 5.2-0.7 6.6-3 1.4 1.5 2.5 3.5 3 5.8h2.5c0.3 0 0.6 0.2 0.8 0.4l2.1 3.5c0.3 0.4 0.1 1-0.3 1.3s-1 0.1-1.3-0.3l-1.8-3h-1.7c0 0.4 0.1 0.9 0.1 1.3 0 1.4-0.2 2.7-0.6 4h2.7c0.3 0 0.6 0.2 0.8 0.5z" />
                                                </g>
                                            </g>
                                        </g>
                                    </g>
                                </g>
                            </svg>
                        }
                        iconSize={iconSize}
                        onClick={this.context.onSetDebuggerMode}
                        selected={
                            this.context.runtime &&
                            this.context.runtime.isDebuggerActive
                        }
                        attention={
                            !!(
                                this.context.runtime &&
                                this.context.runtime.error
                            )
                        }
                    />
                </div>
            );
        }
    }
);

const Search = observer(
    class Search extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        constructor(props: any) {
            super(props);

            makeObservable(this, {
                onSearchPatternChange: action.bound,
                toggleMatchCase: action.bound,
                toggleMatchWholeWord: action.bound
            });
        }

        startSearch() {
            this.context.layoutModels.selectTab(
                this.context.layoutModels.root,
                LayoutModels.SEARCH_RESULTS_TAB_ID
            );

            startSearch(
                this.context,
                this.context.uiStateStore.searchPattern,
                this.context.uiStateStore.searchMatchCase,
                this.context.uiStateStore.searchMatchWholeWord
            );
        }

        onSearchPatternChange(event: any) {
            this.context.uiStateStore.searchPattern = event.target.value;
            this.startSearch();
        }

        toggleMatchCase() {
            this.context.uiStateStore.searchMatchCase =
                !this.context.uiStateStore.searchMatchCase;
            this.startSearch();
        }

        toggleMatchWholeWord() {
            this.context.uiStateStore.searchMatchWholeWord =
                !this.context.uiStateStore.searchMatchWholeWord;
            this.startSearch();
        }

        render() {
            return (
                <div
                    className="btn-group"
                    style={{
                        visibility: this.context.runtime ? "hidden" : "inherit",
                        width: 0,
                        justifyContent: "flex-end"
                    }}
                >
                    <input
                        className={classNames(
                            "form-control EezStudio_ToolbarSearchInput",
                            {
                                empty: !this.context.uiStateStore.searchPattern
                            }
                        )}
                        type="text"
                        placeholder="&#xe8b6;"
                        value={this.context.uiStateStore.searchPattern ?? ""}
                        onChange={this.onSearchPatternChange}
                    />
                    <div className="btn-group" role="group">
                        <IconAction
                            icon={
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M7.495 9.052l.891 2.35h1.091L6.237 3h-1.02L2 11.402h1.095l.838-2.35h3.562zM5.811 4.453l.044.135 1.318 3.574H4.255l1.307-3.574.044-.135.038-.156.032-.152.021-.126h.023l.024.126.029.152.038.156zm7.984 6.011v.936h.96V7.498c0-.719-.18-1.272-.539-1.661-.359-.389-.889-.583-1.588-.583-.199 0-.401.019-.606.056a4.875 4.875 0 0 0-1.078.326 2.081 2.081 0 0 0-.343.188v.984c.266-.23.566-.411.904-.54a2.927 2.927 0 0 1 1.052-.193c.188 0 .358.028.513.085a.98.98 0 0 1 .396.267c.109.121.193.279.252.472.059.193.088.427.088.7l-1.811.252c-.344.047-.64.126-.888.237a1.947 1.947 0 0 0-.615.419 1.6 1.6 0 0 0-.36.58 2.134 2.134 0 0 0-.117.721c0 .246.042.475.124.688.082.213.203.397.363.551.16.154.36.276.598.366.238.09.513.135.826.135.402 0 .76-.092 1.075-.278.315-.186.572-.454.771-.806h.023zm-2.128-1.743c.176-.064.401-.114.674-.149l1.465-.205v.609c0 .246-.041.475-.123.688a1.727 1.727 0 0 1-.343.557 1.573 1.573 0 0 1-.524.372 1.63 1.63 0 0 1-.668.135c-.187 0-.353-.025-.495-.076a1.03 1.03 0 0 1-.357-.211.896.896 0 0 1-.22-.316A1.005 1.005 0 0 1 11 9.732a1.6 1.6 0 0 1 .055-.44.739.739 0 0 1 .202-.334 1.16 1.16 0 0 1 .41-.237z"
                                        fill="%23007bff"
                                    />
                                </svg>
                            }
                            title="Match case"
                            iconSize={20}
                            enabled={true}
                            selected={this.context.uiStateStore.searchMatchCase}
                            onClick={this.toggleMatchCase}
                        />
                        <IconAction
                            icon={
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    xmlns="http://www.w3.org/2000/svg"
                                >
                                    <path
                                        fillRule="evenodd"
                                        clipRule="evenodd"
                                        d="M1 2h14v1H1V2zm13 2h-1v8h1V4zm-2.728 4.387a2.353 2.353 0 0 0-.36-.786 1.746 1.746 0 0 0-.609-.53 1.832 1.832 0 0 0-.866-.193c-.198 0-.38.024-.547.073a1.76 1.76 0 0 0-.453.205 1.724 1.724 0 0 0-.365.318l-.179.258V4.578H7V12h.893v-.575l.126.175c.087.102.189.19.304.269.117.078.249.14.398.186.149.046.314.068.498.068.353 0 .666-.071.937-.212.272-.143.499-.338.682-.586.183-.25.321-.543.414-.879.093-.338.14-.703.14-1.097a3.756 3.756 0 0 0-.12-.962zM9.793 7.78c.151.071.282.176.39.314.109.14.194.313.255.517.051.174.082.371.089.587l-.007.125c0 .327-.033.62-.1.869a1.886 1.886 0 0 1-.278.614c-.117.162-.26.285-.421.366-.322.162-.76.166-1.069.015a1.264 1.264 0 0 1-.393-.296 1.273 1.273 0 0 1-.218-.367s-.179-.447-.179-.947c0-.5.179-1.002.179-1.002.062-.177.136-.318.224-.43.114-.143.256-.259.424-.345.168-.086.365-.129.587-.129.19 0 .364.037.517.109zM15 13H1v1h14v-1zM2.813 10l-.728 2.031H1l.025-.072 2.441-7.086h.941l2.485 7.158H5.81L5.032 10H2.813zm1.121-3.578h-.022l-.905 2.753h1.841l-.914-2.753z"
                                        fill="%23007bff"
                                    />
                                </svg>
                            }
                            title="Match whole word"
                            iconSize={20}
                            enabled={true}
                            selected={
                                this.context.uiStateStore.searchMatchWholeWord
                            }
                            onClick={this.toggleMatchWholeWord}
                        />
                        <IconAction
                            title="Refresh search results"
                            icon="material:refresh"
                            enabled={true}
                            onClick={() => this.startSearch()}
                        />
                    </div>
                </div>
            );
        }
    }
);

const SelectLanguage = observer(
    class SelectLanguage extends React.Component {
        static contextType = ProjectContext;
        declare context: React.ContextType<typeof ProjectContext>;

        render() {
            return (
                <select
                    className="form-select"
                    value={
                        this.context.uiStateStore.selectedLanguage.languageID
                    }
                    onChange={action(
                        (event: React.ChangeEvent<HTMLSelectElement>) =>
                            (this.context.uiStateStore.selectedLanguageID =
                                event.currentTarget.value)
                    )}
                    style={{ width: "fit-content" }}
                >
                    {this.context.project.texts.languages.map(language => (
                        <option
                            key={language.languageID}
                            value={language.languageID}
                        >
                            {language.languageID}
                        </option>
                    ))}
                </select>
            );
        }
    }
);