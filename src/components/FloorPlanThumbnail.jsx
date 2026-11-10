export default function FloorPlanThumbnail({ fp }) {
  if (!fp?.imageData) return null
  return (
    <img
      src={fp.imageData}
      alt={fp.name}
      className="w-full h-full object-cover rounded-lg"
    />
  )
}
