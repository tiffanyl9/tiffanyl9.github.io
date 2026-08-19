# Credits

## Header photograph

The watercolour banner at the top of the app is a derivative of a real photograph
of Promontory Point, not an illustration.

- **Original:** *Promontory Point shoreline in Autumn*, photographed 16 October 2005
- **Photographer:** Kim Scarborough
- **Source:** [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Promontory_Point_shoreline_in_Autumn.jpg)
- **Licence:** [CC BY-SA 2.0](https://creativecommons.org/licenses/by-sa/2.0/)
- **Changes made:** cropped to exclude Lake Shore Drive and the car park, then put
  through a watercolour treatment (colour simplification, edge pigment, wash, paper
  grain) using `tools/watercolor.py`. Output saved as `budget/img/point-header.jpg`
  and `budget/img/point-header-sm.jpg`.

CC BY-SA is a share-alike licence, so **those two derived images are themselves
offered under CC BY-SA 2.0**, and the credit above has to stay with them. It appears
in the app on the Summary tab as well as here.

This applies only to the header images. The rest of the app — the HTML, CSS and
JavaScript — is your own work and isn't affected by the photograph's licence.

### Replacing the photograph

If you'd rather use a different picture, drop it in and re-run:

```bash
python3 tools/make-header.py path/to/your-photo.jpg
```

Then update this file and the credit line in `budget/index.html` to match the new
source. If you use your own photograph, you can delete both — the share-alike
obligation only comes from the Commons image.
