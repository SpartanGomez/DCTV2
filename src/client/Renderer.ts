// src/client/Renderer.ts
// Single renderer: owns the PixiJS Application and exposes its stage.
// Scenes are added to the stage via SceneManager. Per SPEC §6: no sub-renderers.

import { Application } from 'pixi.js'

export class Renderer {
  readonly app: Application

  private constructor(app: Application) {
    this.app = app
  }

  static async create(mount: HTMLElement): Promise<Renderer> {
    const app = new Application()
    await app.init({
      background: '#0a0a15',
      resizeTo: mount,
      antialias: false,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    })
    mount.appendChild(app.canvas)
    return new Renderer(app)
  }

  get width(): number {
    return this.app.screen.width
  }

  get height(): number {
    return this.app.screen.height
  }

  destroy(): void {
    this.app.destroy(true, { children: true })
  }
}
