/**
 * Export the procedural cute cat (with Idle / CuteRun / Stumble) to public/models/cat-racer.glb
 * Run: npx tsx scripts/export-cat-glb.ts
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as THREE from "three";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";

import {
  createCuteCatClips,
  createCuteCatRoot,
} from "../src/game/cuteCatModel.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.resolve(__dirname, "../public/models/cat-racer.glb");

/** Minimal FileReader so three's GLTFExporter can run under Node. */
class NodeFileReader {
  result: ArrayBuffer | null = null;
  onloadend: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;

  readAsArrayBuffer(blob: Blob) {
    void blob
      .arrayBuffer()
      .then((buf) => {
        this.result = buf;
        this.onloadend?.({});
      })
      .catch((err) => {
        this.onerror?.(err);
      });
  }
}

(globalThis as { FileReader?: unknown }).FileReader = NodeFileReader;

async function main() {
  const root = createCuteCatRoot("#ffffff");
  const clips = createCuteCatClips();
  const scene = new THREE.Scene();
  scene.name = "CatScene";
  scene.add(root);

  const exporter = new GLTFExporter();
  const result = await exporter.parseAsync(scene, {
    binary: true,
    animations: clips,
    onlyVisible: false,
  });

  if (!(result instanceof ArrayBuffer)) {
    throw new Error("Expected binary GLB ArrayBuffer from GLTFExporter");
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, Buffer.from(result));
  console.log(`Wrote ${outPath} (${result.byteLength} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
