/// <reference types="vite/client" />

interface Window {
  aiApi?: import('@/contracts/ai').AiApi;
  aiCanvasPreviewWindowApi?: import('@/contracts/ai').AiCanvasPreviewWindowApi;
}

declare module 'gasp'
declare module '*.vue';
declare module 'fs-extra';
