"""scripts/click_utils.py

Custom click parameter types and utilities.
"""

from typing import List, Any, Tuple, Dict
import pathlib
import glob
import re
import os
import string

import click


class GlobbityGlob(click.ParamType):
    """Expands a glob pattern to Path objects"""
    name = 'glob'

    def convert(self, value: str, *args: Any) -> List[pathlib.Path]:
        return [pathlib.Path(f) for f in glob.glob(value)]


class PathlibPath(click.Path):
    """Converts a string to a pathlib.Path object"""

    def convert(self, *args: Any) -> pathlib.Path:  # type: ignore
        return pathlib.Path(super().convert(*args))


RasterPatternType = Tuple[List[str], Dict[Tuple[str, ...], str]]


class RasterPattern(click.ParamType):
    """Expands a pattern following the Python format specification to matching files"""
    name = 'raster-pattern'

    def convert(self, value: str, *args: Any) -> RasterPatternType:
        value = os.path.realpath(value).replace('\\', '\\\\')

        try:
            parsed_value = list(string.Formatter().parse(value))
        except ValueError as exc:
            self.fail(f'Invalid pattern: {exc!s}')

        # extract keys from format string and assemble glob and regex patterns matching it
        keys = [field_name for _, field_name, _, _ in parsed_value if field_name]
        glob_pattern = value.format(**{k: '*' for k in keys})
        regex_pattern = value.format(**{k: f'(?P<{k}>\\w+)' for k in keys})

        if not keys:
            self.fail('Pattern must contain at least one placeholder')

        try:
            compiled_pattern = re.compile(regex_pattern)
        except re.error as exc:
            self.fail(f'Could not parse pattern to regex: {exc!s}')

        # use glob to find candidates, regex to extract placeholder values
        candidates = [os.path.realpath(candidate) for candidate in glob.glob(glob_pattern)]
        matched_candidates = [compiled_pattern.match(candidate) for candidate in candidates]

        if not any(matched_candidates):
            self.fail('Given pattern matches no files')

        key_combinations = [tuple(match.groups()) for match in matched_candidates if match]
        if len(key_combinations) != len(set(key_combinations)):
            self.fail('Pattern leads to duplicate keys')

        files = {tuple(match.groups()): match.group(0) for match in matched_candidates if match}
        return keys, files


class TOMLFile(click.ParamType):
    """Parses a TOML file to a dict"""
    name = 'toml-file'

    def convert(self, value: str, *args: Any) -> Dict[str, Any]:
        import toml
        return dict(toml.load(value))


class Hostname(click.ParamType):
    """Parses a string to a valid hostname"""
    name = 'url'

    def __init__(self, default_port: int = 5000, default_scheme: str = 'http') -> None:
        self.default_port = default_port
        self.default_scheme = default_scheme

    def convert(self, value: str, *args: Any) -> str:
        from urllib.parse import urlparse, urlunparse
        parsed_url = urlparse(value)

        if not parsed_url.netloc:
            value_with_scheme = '://'.join([self.default_scheme, value])
            parsed_url = urlparse(value_with_scheme)

        # remove everything we don't need
        return urlunparse([parsed_url.scheme, parsed_url.netloc, parsed_url.path])
