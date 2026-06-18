// Jest setup (auto-loaded by react-scripts/craco test).
import "@testing-library/jest-dom";
import { TextEncoder, TextDecoder } from "util";

// jsdom (jest 27) does not provide these globals that some modern deps expect.
if (typeof global.TextEncoder === "undefined") {
  global.TextEncoder = TextEncoder;
}
if (typeof global.TextDecoder === "undefined") {
  // eslint-disable-next-line no-undef
  global.TextDecoder = TextDecoder;
}
