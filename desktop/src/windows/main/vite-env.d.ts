/// <reference types="vite/client" />

interface Window {
  aiApi?: import('@/contracts/ai').AiApi;
}

declare module 'gasp'
declare module '*.vue';
declare module 'fs-extra';
