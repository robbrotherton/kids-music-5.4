export class AudioEngine {
  private audioContext: AudioContext | null = null;
  private workletReady = false;

  async getContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ latencyHint: "interactive" });
    }

    return this.audioContext;
  }

  async resume() {
    const context = await this.getContext();

    if (context.state === "suspended") {
      await context.resume();
    }

    return context;
  }

  async createBitcrusherNode() {
    const context = await this.getContext();

    if (!this.workletReady) {
      await context.audioWorklet.addModule("/audio/bitcrusher-worklet.js");
      this.workletReady = true;
    }

    return new AudioWorkletNode(context, "bitcrusher", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
  }

  async dispose() {
    if (!this.audioContext) {
      return;
    }

    const context = this.audioContext;
    this.audioContext = null;
    this.workletReady = false;
    await context.close();
  }
}
