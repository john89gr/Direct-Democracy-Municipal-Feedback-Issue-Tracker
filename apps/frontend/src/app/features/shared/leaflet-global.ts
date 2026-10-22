/**
 * `leaflet.heat`'s dist is a plain browser script that dereferences the
 * global `L` at evaluation time (`L.HeatLayer = (L.Layer ? ... )`).
 * Inside an esbuild bundle that global does not exist, so the module
 * throws `ReferenceError: L is not defined` and the whole lazy chunk
 * fails to load. Import this module BEFORE `leaflet.heat` to register
 * the global first.
 */
import * as L from 'leaflet';

(globalThis as Record<string, unknown>).L = L;
