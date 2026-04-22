import { defineStore } from "pinia";
import { ref } from "vue";

export const useGlobalStore = defineStore('global', () => {
    const currentPage = ref('首页');
    const topbarColor = ref('');

    const setCurrentPage = (page: string) => {
        currentPage.value = page;
    }

    const setTopbarColor = (color: string) => {
        topbarColor.value = color;
    }

    return {
        currentPage,
        setCurrentPage,
        topbarColor,
        setTopbarColor,
    }
})