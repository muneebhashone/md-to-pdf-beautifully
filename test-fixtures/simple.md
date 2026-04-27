# The Quiet Architecture of Lighthouses

A lighthouse, despite its romance, is at heart a piece of *infrastructure*. It exists to communicate one bit reliably across kilometers of weather: **here is land, do not come closer**.

## Light, on a schedule

Every major lighthouse has a unique flash signature — its **characteristic** — published in nautical almanacs[^1]. Encoding identity in time rather than place is one of the earliest forms of broadcast networking.

| Station | Flash | Period |
| --- | --- | --- |
| Eddystone | 2 white | 10 s |
| Bell Rock | 1 white | 12 s |
| Tillamook Rock | 1 white | 5 s |

> "Their nightly task is rooted in the calculus of attention." — *Anon., Trinity House, 1887*

### A reading list

- [Wikipedia: Lighthouse](https://en.wikipedia.org/wiki/Lighthouse)
- A book that does not exist (yet)
- An [external link](https://example.com) and an internal jump to [the lens section](#fresnel)

## Fresnel { #fresnel }

The Fresnel lens is the great unsung optical invention: it captures more of a flame's light than any reflector dish, while weighing a fraction of an equivalent bulk lens.

```python
def characteristic(period_s: float, flashes: int) -> str:
    return f"{flashes}@{period_s:.1f}s"

print(characteristic(10.0, 2))  # "2@10.0s"
```

A small inline `code` example, and a final paragraph to test the orphan/widow controls used on press.

[^1]: Such as the *Admiralty List of Lights and Fog Signals*, published by the United Kingdom Hydrographic Office.
