export interface HomeProfileDto {
  id: number;
  key: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface DeleteHomeProfileResult {
  activeProfileKey: string;
  profiles: HomeProfileDto[];
}

export interface HomeProfileApi {
  listProfiles: () => Promise<HomeProfileDto[]>;
  getActiveProfileKey: () => Promise<string>;
  setActiveProfile: (key: string) => Promise<HomeProfileDto>;
  createProfile: (input: { name: string }) => Promise<HomeProfileDto>;
  renameProfile: (key: string, name: string) => Promise<HomeProfileDto>;
  deleteProfile: (key: string) => Promise<DeleteHomeProfileResult>;
}
