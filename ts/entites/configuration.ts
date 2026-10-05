import { ClavierDisposition } from "./clavierDisposition";
import { Theme } from "./theme";
import { VolumeSon } from "./volumeSon";

export default class Configuration {
  public static Default: Configuration = {
    hasAudio: false,
    afficherRegles: true,
    afficherChrono: true,
    volumeSon: VolumeSon.Normal,
    disposition: ClavierDisposition.Azerty,
    theme: Theme.Sombre,
    haptique: false,
    changelog: 0,
  };

  hasAudio: boolean = false;
  afficherRegles: boolean = true;
  afficherChrono: boolean = true;
  volumeSon: VolumeSon = VolumeSon.Normal;
  disposition: ClavierDisposition = ClavierDisposition.Azerty;
  theme: Theme = Theme.Sombre;
  haptique: boolean = false;
  changelog: number = 0;
}
