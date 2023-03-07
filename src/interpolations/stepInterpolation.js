export default function stepInterpolation(points) {
    return points.reduce((acc, point, idx) => {
        acc.push(point);
        if (points[idx + 1]) {
        acc.push({ x: points[idx + 1].x, y: point.y });
        }
        return acc;
    }, []);
}