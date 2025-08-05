import { defineStore } from "pinia";
import { ref } from "vue";

export const useGlobalStore = defineStore('global', () => {
    const currentPage = ref('首页');

    const setCurrentPage = (page: string) => {
        currentPage.value = page;
    }

    return {
        currentPage,
        setCurrentPage
    }
})