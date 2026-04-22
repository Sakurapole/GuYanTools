<template>
  <DetachedTerminal
    :session-id="sessionId"
    :target="popupTarget"
    :initial-label="initialLabel"
  />
</template>

<script lang="ts" setup>
import DetachedTerminal from './DetachedTerminal.vue';

/**
 * Entry-point Vue component for the detached terminal window.
 *
 * Extracts session identity from the URL query parameters and delegates
 * all rendering to DetachedTerminal.vue — a component tree that is
 * completely independent from the main window's TerminalPage.
 */
const searchParams = new URLSearchParams(window.location.search);
const sessionId = searchParams.get('sessionId') ?? '';
const popupTarget = searchParams.get('target') ?? '';
const initialLabel = searchParams.get('label') ?? '';

console.log('[TerminalWindow] Loaded. sessionId:', sessionId, 'target:', popupTarget, 'label:', initialLabel);
</script>
