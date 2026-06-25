// hook function to get the most played songs / albums
import { useState, useEffect } from "react";
import { apiFetch } from "@/lib/api";
import getCovers from "@/lib/getCovers"

const SOURCE_PATH = "/api/charts/mostplayed"

export function useMostPlayed({
  isChart = false,
  dateStart,
  dateEnd,
  limit = 10,
} = {}) 
{
  const [mostplayed, setMostplayed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    // fetching most played api
    async function fetchMostplayed() {
      try {
        setLoading(true);
        setError(null);

        const params = new URLSearchParams({
          isChart: String(isChart),
          dateStart,
          dateEnd,
          limit: String(limit),
        });

        const result = await apiFetch(
          `${SOURCE_PATH}?${params}`
        );
        
        // adding album covers
        const withCovers = await Promise.all(
          result.map(async (item) => ({
            ...item,
            cover:
              (await getCovers(
                item.artist,
                item?.song || null,
                item.album
              )) || "/CD_1_Filler.jpg",
          }))
        );
        

        if (!cancelled) {
          setMostplayed(withCovers);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMostplayed();

    return () => {
      cancelled = true;
    };
  }, [isChart, dateStart, dateEnd, limit]);

  return { mostplayed, loading, error };
}