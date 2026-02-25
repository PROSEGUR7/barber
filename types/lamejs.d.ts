declare module "lamejs" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number)
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array | Uint8Array | number[]
    flush(): Int8Array | Uint8Array | number[]
  }
}

declare module "lamejs/src/js/index.js" {
  export class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number)
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array | Uint8Array | number[]
    flush(): Int8Array | Uint8Array | number[]
  }
}
