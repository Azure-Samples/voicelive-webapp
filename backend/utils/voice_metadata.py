import json
import ast
import re
from typing import Any, Dict, Optional, Mapping


def _safe_parse_json(s: str) -> Any:
    """Robustly parse a JSON-like string into Python objects.

    Tries json.loads, wrapping concatenated objects into array, extracting
    substring between braces, and finally ast.literal_eval as a last resort.
    Returns the raw input if parsing fails.
    """
    if not isinstance(s, str):
        return s
    s_str = s.strip()

    # 1) direct json
    try:
        return json.loads(s_str)
    except Exception:
        pass

    # 2) concatenated objects -> wrap in array
    if '}{' in s_str:
        try:
            # wrap concatenated objects into an array
            candidate = '[' + s_str.replace('}{', '},{') + ']'
            return json.loads(candidate)
        except Exception:
            pass

    # 3) extract substring between first '{' and last '}'
    start = s_str.find('{')
    end = s_str.rfind('}')
    if start != -1 and end > start:
        try:
            return json.loads(s_str[start:end + 1])
        except Exception:
            pass

    # 4) try python literal eval (for single-quoted dicts)
    try:
        return ast.literal_eval(s_str)
    except Exception:
        pass

    # fallback: return original string
    return s


def _stitch_chunks(data: Mapping[str, Any], prefix: str) -> Optional[str]:
    """Concatenate keys like '{prefix}_chunk_1', '{prefix}_chunk_2', ... in order."""
    pattern = re.compile(re.escape(prefix) + r'_chunk_(\d+)$')
    parts = []
    for k in sorted(data.keys()):
        m = pattern.match(k)
        if m:
            parts.append((int(m.group(1)), str(data[k])))
    if not parts:
        return None
    parts.sort(key=lambda x: x[0])
    return ''.join(p for _, p in parts)


def _flatten_dict(d: Mapping[str, Any], parent_key: str = '', sep: str = '.') -> Dict[str, Any]:
    """Flatten nested dict into dot-separated keys."""
    items: Dict[str, Any] = {}
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, Mapping):
            items.update(_flatten_dict(v, new_key, sep=sep))
        elif isinstance(v, list):
            for i, item in enumerate(v):
                if isinstance(item, Mapping):
                    items.update(_flatten_dict(item, f"{new_key}[{i}]", sep=sep))
                else:
                    items[f"{new_key}[{i}]"] = item
        else:
            items[new_key] = v
    return items


def parse_voice_live_metadata(data: Mapping[str, Any]) -> Dict[str, Any]:
    """Parse voiceLiveConfig metadata from a dict containing chunked keys.

    Looks for 'voiceLiveConfig' or stitched 'voiceLiveConfig_chunk_<n>' keys,
    parses the JSON-like content, normalizes common wrappers, and returns a
    flattened dictionary of key -> value for easy consumption.
    """
    raw = None
    if 'voiceLiveConfig' in data:
        raw = data['voiceLiveConfig']
    else:
        stitched = _stitch_chunks(data, 'voiceLiveConfig')
        if stitched:
            raw = stitched
        else:
            raw = data.get('voiceLiveConfig_meta')

    if raw is None:
        return {}

    parsed = _safe_parse_json(raw)

    print(f"Parsed voiceLiveConfig raw data: {raw}")

    # normalize list-of-one
    if isinstance(parsed, list) and len(parsed) == 1:
        parsed = parsed[0]

    if not isinstance(parsed, dict):
        return {}

    # prefer 'config' wrapper if present
    candidate = parsed.get('config') if isinstance(parsed.get('config'), dict) else parsed

    return _flatten_dict(candidate)


def extract_selected_fields(flat: Mapping[str, Any]) -> Dict[str, Any]:
    """Return the specific fields requested by the user.

    Keys returned: language, shortName, voiceType, voiceActivityDetection,
    noiseSuppression, echoCancellation, avatarName
    """
    def first_of(keys):
        for key in keys:
            if key in flat:
                return flat[key]
        return None

    return {
        'language': first_of(['speech.language', 'language', 'speech[0].language']),
        'shortName': first_of(['speech.voice.shortName', 'speech.voice[0].shortName', 'shortName']),
        'voiceType': first_of(['speech.voice.voiceType', 'voiceType']),
        'voiceActivityDetection': first_of(['speech.voiceActivityDetection', 'speech.voiceActivityDetection', 'voiceActivityDetection']),
        'noiseSuppression': first_of(['speech.noiseSuppression', 'noiseSuppression']),
        'echoCancellation': first_of(['speech.echoCancellation', 'echoCancellation']),
        'avatarName': first_of(['avatar.selectedAvatar.avatarName', 'avatar.selectedAvatar.name', 'selectedAvatar.avatarName', 'avatarName']),
    }
