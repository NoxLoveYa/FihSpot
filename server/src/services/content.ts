import { prisma } from '../prisma';
import { unlinkUpload } from '../utils/files';

export async function deletePoiWithFiles(poiId: string) {
  const poi = await prisma.poI.findUnique({
    where: { id: poiId },
    include: { photos: { select: { url: true } } },
  });
  if (!poi) return null;

  const photoUrls = poi.photos.map((p) => p.url);
  await prisma.poI.delete({ where: { id: poiId } });
  photoUrls.forEach(unlinkUpload);
  return poi;
}

export async function deleteCommentById(commentId: string) {
  const comment = await prisma.comment.findUnique({ where: { id: commentId } });
  if (!comment) return null;

  await prisma.comment.delete({ where: { id: commentId } });
  return comment;
}

export async function deletePhotoWithFile(photoId: string) {
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) return null;

  await prisma.photo.delete({ where: { id: photoId } });
  unlinkUpload(photo.url);
  return photo;
}

export async function deleteUserWithContent(userId: string) {
  const pois = await prisma.poI.findMany({
    where: { createdById: userId },
    select: { id: true },
  });

  for (const poi of pois) {
    await deletePoiWithFiles(poi.id);
  }

  const photos = await prisma.photo.findMany({
    where: { userId },
    select: { id: true, url: true },
  });
  for (const photo of photos) {
    await prisma.photo.delete({ where: { id: photo.id } });
    unlinkUpload(photo.url);
  }

  await prisma.comment.deleteMany({ where: { userId } });
  await prisma.user.delete({ where: { id: userId } });
}
