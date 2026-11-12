# Father and Son

A five-minute private documentary for Swritsinh and his father. The film may use only photographs and videos already in the library. It must not invent events, places, relationships or words that were never written on a picture.

Duration: 300

Opening

- A FATHER AND HIS SON
- Five minutes from these years
- Only what you kept.

Closing

- HAPPY BIRTHDAY
- The years in these pictures
- With love, from Dad.

Chapters

- beginning | The beginning | His first year | 0-12
- beside | Beside you | One and two | 12-30
- growing | Growing | Two and three | 30-48
- nearly | Nearly five | Four, until this birthday | 48-120

The ending uses the owner's own vocal recording of the traditional Happy Birthday melody, assigned the role happy_birthday_vocal_standard. If that recording is missing, the film does not render and does not substitute an instrumental. Favourite and pinned pictures are held longer. Pictures with uncertain dates stay out of the cut and are listed for review. Duplicate copies are skipped; the originals remain in the library.

```json
{
  "schemaVersion": 1,
  "id": "father-and-son-five-minutes",
  "title": "Father and Son",
  "description": "A five-minute film made only from photographs and videos already in the private library. Chapters follow age, captions use words the owner wrote, and the ending waits for a Happy Birthday vocal the owner supplies.",
  "targetSeconds": 300,
  "preferredResolution": "2160p",
  "previewResolution": "1080p",
  "fps": 24,
  "aspect": "16:9",
  "color": { "grade": "warm-natural" },
  "opening": {
    "lines": ["A FATHER AND HIS SON", "Five minutes from these years", "Only what you kept."],
    "seconds": 8
  },
  "closing": {
    "lines": ["HAPPY BIRTHDAY", "The years in these pictures", "With love, from Dad."],
    "seconds": 18
  },
  "chapters": [
    { "key": "beginning", "title": "The beginning", "subtitle": "His first year", "fromMonths": 0, "toMonths": 12 },
    { "key": "beside", "title": "Beside you", "subtitle": "One and two", "fromMonths": 12, "toMonths": 30 },
    { "key": "growing", "title": "Growing", "subtitle": "Two and three", "fromMonths": 30, "toMonths": 48 },
    { "key": "nearly", "title": "Nearly five", "subtitle": "Four, until this birthday", "fromMonths": 48, "toMonths": 120 }
  ],
  "shots": {
    "minSeconds": 3.2,
    "baseSeconds": 4.2,
    "heroSeconds": 6.5,
    "transition": "crossfade",
    "motion": ["in", "out", "left", "right"]
  },
  "audio": {
    "instrumental": { "required": false },
    "finale": { "role": "happy_birthday_vocal_standard", "required": true, "align": "end" }
  },
  "selection": {
    "includeUndated": false,
    "flagUndatedForReview": true,
    "preferFavorites": true,
    "deduplicate": true,
    "curated": true,
    "includeVideoStills": true
  },
  "captions": { "source": "owner-written-only", "allowAi": false }
}
```
