/**
 * ドラッグ中に画面の上端・下端付近にカーソルが来たとき、自動でウィンドウを
 * スクロールするヘルパー。requestAnimationFrame で滑らかに動作する。
 *
 * 速度はエッジからの距離に応じてリニアに変化する:
 *   - エッジまで EDGE_THRESHOLD_PX 以内: 加速
 *   - エッジまで MIN_DISTANCE_PX 以内: 最大速度 MAX_SPEED_PX_PER_FRAME
 */
const EDGE_THRESHOLD_PX = 80;
const MIN_DISTANCE_PX = 8;
const MAX_SPEED_PX_PER_FRAME = 18;

export class Autoscroller {
  private rafId: number | null = null;
  private currentSpeed = 0;

  /**
   * カーソル位置に応じてオートスクロールを更新する。
   * ドラッグ中に dragover イベント等から繰り返し呼ぶ。
   */
  update(clientY: number, viewportHeight: number): void {
    const speed = this.computeSpeed(clientY, viewportHeight);
    this.currentSpeed = speed;
    if (speed === 0) {
      this.stop();
      return;
    }
    if (this.rafId === null) {
      this.startLoop();
    }
  }

  /**
   * オートスクロールを停止する。dragend / drop / dragleave 時に呼ぶ。
   */
  stop(): void {
    this.currentSpeed = 0;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * 現在の速度 (px/frame, 正: 下方向 / 負: 上方向)。テスト用に公開。
   */
  getSpeed(): number {
    return this.currentSpeed;
  }

  private computeSpeed(clientY: number, viewportHeight: number): number {
    const fromTop = clientY;
    const fromBottom = viewportHeight - clientY;

    if (fromTop < EDGE_THRESHOLD_PX) {
      const distance = Math.max(fromTop, MIN_DISTANCE_PX);
      const ratio =
        (EDGE_THRESHOLD_PX - distance) / (EDGE_THRESHOLD_PX - MIN_DISTANCE_PX);
      return -Math.round(MAX_SPEED_PX_PER_FRAME * ratio);
    }
    if (fromBottom < EDGE_THRESHOLD_PX) {
      const distance = Math.max(fromBottom, MIN_DISTANCE_PX);
      const ratio =
        (EDGE_THRESHOLD_PX - distance) / (EDGE_THRESHOLD_PX - MIN_DISTANCE_PX);
      return Math.round(MAX_SPEED_PX_PER_FRAME * ratio);
    }
    return 0;
  }

  private startLoop(): void {
    const step = () => {
      if (this.currentSpeed === 0) {
        this.rafId = null;
        return;
      }
      window.scrollBy(0, this.currentSpeed);
      this.rafId = window.requestAnimationFrame(step);
    };
    this.rafId = window.requestAnimationFrame(step);
  }
}
