import { defineStore } from "pinia";
import { ref } from "vue";

export const useBarStore = defineStore('bar', () => {
    const sidebarVisible = ref(false);

    const toggleSidebar = () => {
        sidebarVisible.value = !sidebarVisible.value;
    }

    return {
        sidebarVisible,
        toggleSidebar
    }
})