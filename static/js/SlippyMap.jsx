import React, { useEffect, useRef, useState } from "react";
import { Map, View } from 'ol';
import TileLayer from 'ol/layer/Tile';
import OSM from 'ol/source/OSM';
// import 'ol/ol.css';

const SlippyMap = ({geo}) => {
    const [map, setMap] = useState();
    const mapElement = useRef();
    const mapRef = useRef();
    mapRef.current = map;

    console.log(geo)

    useEffect(() => {
        const initialMap = new Map({
          target: mapElement.current,
            layers: [
                new TileLayer({
                    source: new OSM(),
                }),

            ],
            view: new View({
                center: geo.value[0, 0],
                zoom: 0,
            }),


        });
        setMap(initialMap);
    }, []);

    return (
      <div ref={mapElement} className="map-container slippyMap" />
    );

}

export default SlippyMap;