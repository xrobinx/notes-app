import { Capacitor, registerPlugin } from '@capacitor/core'

interface PencilSketchPlugin {
  open(options: { drawingData?: string | null }): Promise<{ drawingData: string; previewPng: string }>
}

const PencilSketch = registerPlugin<PencilSketchPlugin>('PencilSketch')

export async function openNativePencilSketch(drawingData?: string | null): Promise<{ drawingData: string; previewPng: string } | null> {
  if (!Capacitor.isNativePlatform()) return null
  try {
    return await PencilSketch.open({ drawingData })
  } catch {
    return null
  }
}
