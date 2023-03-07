export default function stepInterpolation(points) {
    return points.reduce((acc, point, idx) => {
        acc.push(point);
        if (cachedData[idx + 1]) {
        acc.push({ x: cachedData[idx + 1].x, y: point.y });
        }
        return acc;
    }, []);
}