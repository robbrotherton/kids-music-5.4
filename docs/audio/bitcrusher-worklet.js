class BitcrusherProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      {
        name: "bits",
        defaultValue: 14,
        minValue: 2,
        maxValue: 16,
        automationRate: "k-rate",
      },
      {
        name: "normfreq",
        defaultValue: 1,
        minValue: 0.02,
        maxValue: 1,
        automationRate: "k-rate",
      },
    ];
  }

  constructor() {
    super();
    this.phase = 0;
    this.lastSample = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    if (!output.length) {
      return true;
    }

    for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
      const inputChannel = input[channelIndex] ?? input[0];
      const outputChannel = output[channelIndex];

      if (!inputChannel) {
        outputChannel.fill(0);
        continue;
      }

      const bits = parameters.bits[0];
      const normfreq = parameters.normfreq[0];
      const steps = Math.max(2, Math.pow(2, bits));

      for (let sampleIndex = 0; sampleIndex < outputChannel.length; sampleIndex += 1) {
        this.phase += normfreq;

        if (this.phase >= 1) {
          this.phase -= 1;
          const inputSample = inputChannel[sampleIndex];
          this.lastSample = Math.round(inputSample * steps) / steps;
        }

        outputChannel[sampleIndex] = this.lastSample;
      }
    }

    return true;
  }
}

registerProcessor("bitcrusher", BitcrusherProcessor);
