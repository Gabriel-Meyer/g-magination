# Archived: "The Object" 3D scene

The React Three Fiber scene from the first g-magination site iteration (Sep 2026):
a glass block with a coiled rope light inside, presentable in a "studio" or "room"
setting (the room has a Persian rug, image texture with a procedural fallback).

Self-contained — copy `components/three/` and `lib/` into a project together
(relative import `../../lib/coil` must keep resolving) and put
`public/textures/persian-rug.png` in the public root so `/textures/persian-rug.png`
resolves. Without the texture, the rug falls back to a procedural one.

## Dependencies (versions it was built against)

- `react` ^19.2.6
- `three` ^0.184.0
- `@react-three/fiber` ^9.6.1
- `@react-three/drei` ^10.7.7

## Mounting

`Scene.tsx` is the entry point — default export with the `<Canvas>` inside, so it
drops into any React tree. It was lazy-loaded and only mounted when scrolled into
view:

```tsx
const Scene = lazy(() => import('./components/three/Scene'))

<Suspense fallback={null}>
  <Scene
    lightOn={true}            // rope light on/off
    setting="studio"          // 'studio' | 'room'  (SceneSetting export)
    reducedMotion={false}     // disables camera drift/animation
    lowPower={false}          // was true on mobile / coarse pointers
  />
</Suspense>
```

The old wrapper section (`Product.tsx`) with the spec copy and setting toggle was
not archived — only the mounting pattern above matters.
