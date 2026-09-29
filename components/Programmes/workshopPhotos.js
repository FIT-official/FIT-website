// FIT miniature escape room build and NYGH workshop photographs. Source references: docs/workshop-photo-sources.json
export const escapeRoomPhotos = [
  {
    "src": "/images/collaborations/escape-room-team.jpg",
    "alt": "Group gathered behind a miniature escape room with buildings, trees and interactive components",
    "caption": "The team with the completed miniature escape room.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-workshop-group.jpg",
    "alt": "Escape room project group gathered around a workshop table",
    "caption": "A moment together around the workbench.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-model-build.jpg",
    "alt": "Three participants measuring a large white panel at a workbench",
    "caption": "Measuring and preparing the model base.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-keypad.jpg",
    "alt": "Participant holding an electronic keypad beside a laptop",
    "caption": "Trying a keypad input for the project.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-sensor-wiring.jpg",
    "alt": "Hands wiring a breadboard with an ultrasonic sensor and a small servo",
    "caption": "Connecting the sensor, controller and servo.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-button-lights.jpg",
    "alt": "A hand pressing buttons on an illuminated electronic panel",
    "caption": "A button panel that responds with light.",
    "width": 665,
    "height": 1182,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-electronics.jpg",
    "alt": "Controller, breadboard, display and jumper wires on a workshop table",
    "caption": "The parts behind an interactive puzzle.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  },
  {
    "src": "/images/collaborations/escape-room-circuit-work.jpg",
    "alt": "Participants working on electronics beside laptops",
    "caption": "Building and checking a circuit at the workbench.",
    "width": 1024,
    "height": 768,
    "album": "Escape room build"
  }
]

export const schoolWorkshopPhotos = [
  {
    "src": "/images/collaborations/nygh-3d-design-workshop.jpg",
    "alt": "An instructor introducing 3D printing examples to a class at NYGH",
    "caption": "Exploring what a 3D printer can make.",
    "width": 1280,
    "height": 960,
    "album": "School workshops / NYGH"
  },
  {
    "src": "/images/collaborations/nygh-model-measuring.jpg",
    "alt": "NYGH students measuring a panel for their room model",
    "caption": "Measuring the next part of a room model.",
    "width": 1080,
    "height": 1440,
    "album": "School workshops / NYGH"
  },
  {
    "src": "/images/collaborations/nygh-room-models.jpg",
    "alt": "White panel room models under construction at NYGH",
    "caption": "Room layouts taking shape in the classroom.",
    "width": 1080,
    "height": 1440,
    "album": "School workshops / NYGH"
  },
  {
    "src": "/images/collaborations/nygh-printed-mechanism.jpg",
    "alt": "Blue printed mechanism components with gear teeth and circular openings",
    "caption": "Printed parts ready to become a moving mechanism.",
    "width": 1080,
    "height": 1440,
    "album": "School workshops / NYGH"
  },
  {
    "src": "/images/collaborations/nygh-model-planning.jpg",
    "alt": "Students planning a room model around a white panel at NYGH",
    "caption": "Planning the layout before the build.",
    "width": 960,
    "height": 1280,
    "album": "School workshops / NYGH"
  }
]

export const schoolGalleryPhotos = [escapeRoomPhotos[0], ...schoolWorkshopPhotos, ...escapeRoomPhotos.slice(1)]
