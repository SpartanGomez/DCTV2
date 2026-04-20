// src/client/SceneManager.ts
// One active scene at a time. Swap by calling show(next).
// Per SPEC §4 and §6: src/client/scenes/ is the only hierarchy — no parallel `screens/`.

import type { Container } from 'pixi.js'
import type { Renderer } from './Renderer.js'

export interface Scene {
  readonly root: Container
  mount(renderer: Renderer): void
  destroy(): void
}

export class SceneManager {
  private current: Scene | null = null

  constructor(private readonly renderer: Renderer) {}

  show(next: Scene): void {
    if (this.current) {
      this.renderer.app.stage.removeChild(this.current.root)
      this.current.destroy()
    }
    this.current = next
    next.mount(this.renderer)
    this.renderer.app.stage.addChild(next.root)
  }

  get active(): Scene | null {
    return this.current
  }
}
