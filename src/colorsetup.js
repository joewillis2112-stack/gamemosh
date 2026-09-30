// Must be imported before anything creates a THREE.Color: colours in this game are authored
// as final screen values, so three.js should not convert them from sRGB to linear.
import * as THREE from 'three';

THREE.ColorManagement.enabled = false;
