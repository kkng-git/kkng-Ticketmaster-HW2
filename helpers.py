"""Helper utilities for kkng-Ticketmaster-HW2.

This module contains small helper functions that can be used by
`app.py` or other parts of the project.
"""
from typing import Tuple
import geolib.geohash as geohash


def geohashHelper(lng, lat):
    res = geohash.encode(lat, lng, 7)
    return res