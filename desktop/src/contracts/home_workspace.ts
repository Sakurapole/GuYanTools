export interface HomeWorkspaceBackground {
  color?: string;
  image?: string;
  video?: string;
  style?: Record<string, unknown>;
}

export interface HomeWorkspaceBgState {
  header: HomeWorkspaceBackground;
  sidebar: HomeWorkspaceBackground;
}

export interface HomeWorkspaceApi {
  getBackground: () => Promise<HomeWorkspaceBgState>;
  updateBackground: (payload: {
    header?: HomeWorkspaceBackground;
    sidebar?: HomeWorkspaceBackground;
  }) => Promise<HomeWorkspaceBgState>;
}
