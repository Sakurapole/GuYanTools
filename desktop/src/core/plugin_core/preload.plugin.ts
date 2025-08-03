import { contextBridge } from "electron";

contextBridge.exposeInMainWorld('pluginAPI', {
    getPluginInfo: () => {
        return {
            name: "test",
            version: "0.0.1",
            description: "test",
            author: "test",
        }
    },
    send: (message: string) => {
        console.log(message);
    }
});