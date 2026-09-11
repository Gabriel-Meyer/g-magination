# Textures

Drop the Persian/Iznik rug image here as:

    persian-rug.jpg

The room's rug loads `/textures/persian-rug.jpg` automatically. Until the file
exists, the room falls back to a procedurally-drawn rug — no errors either way.

The image is mapped onto a portrait-oriented plane (long axis runs into the
room), so a tall medallion image like the Iznik tile reads correctly. JPG or
PNG is fine; if you use PNG, update `RUG_TEXTURE_URL` in
`src/components/three/Room.tsx`.
