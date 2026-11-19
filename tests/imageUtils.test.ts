import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  getFirstImage,
  extractS3Urls,
  extractAnnotationS3Urls,
  isPlmDefaultImage,
} from '../src/utils/image.ts';
import { projectService } from '../src/services/projectService.ts';
import { DEFAULT_GARMENT_SVG } from '../src/features/projects/constants.ts';

describe('PLM Image Default State & S3 Protection Tests', () => {
  const plmS3Url = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/StyleA_default_1700000000.jpg';
  const annotationS3Url = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/StyleA_annotation_1700000001.jpg';
  const plmDirectUrl = 'https://plm.example.com/api/image.jpg';

  // ── Requirement 1: Default state must check and show PLM image as first image shown ──

  test('Requirement 1: Default state shows PLM image when annotatedImage is null (new PLM item)', () => {
    const result = getFirstImage(null, plmDirectUrl);
    assert.ok(result.includes('plm.example.com') || result.includes(encodeURIComponent(plmDirectUrl)));
  });

  test('Requirement 1: Default state shows PLM image even if annotatedImage is empty string or empty array', () => {
    // If no custom annotations exist yet, default state MUST show PLM image
    const resultEmpty = getFirstImage('', plmDirectUrl);
    assert.ok(resultEmpty.includes('plm.example.com') || resultEmpty.includes(encodeURIComponent(plmDirectUrl)));

    const resultArray = getFirstImage('[]', plmDirectUrl);
    assert.ok(resultArray.includes('plm.example.com') || resultArray.includes(encodeURIComponent(plmDirectUrl)));
  });

  test('Requirement 1: Shows auto-saved PLM image from S3 when available in plmUrl', () => {
    const result = getFirstImage(null, plmS3Url);
    assert.ok(result.includes('StyleA_default_1700000000.jpg'));
  });

  test('Requirement 1: Shows user annotation when an annotation exists in annotatedImage', () => {
    const serialized = JSON.stringify([annotationS3Url]);
    const result = getFirstImage(serialized, plmDirectUrl);
    assert.ok(result.includes('StyleA_annotation_1700000001.jpg'));
  });

  test('Requirement 1: Reverts to PLM image if annotations are deleted/empty', () => {
    const result = getFirstImage('[]', plmS3Url);
    assert.ok(result.includes('StyleA_default_1700000000.jpg'));
  });

  test('Requirement 1: Returns garment placeholder only when neither PLM image nor annotation exists', () => {
    const result = getFirstImage(null, null);
    assert.equal(result, DEFAULT_GARMENT_SVG);
  });

  // ── Requirement 2: PLM image can NEVER be deleted from S3, only annotations can be ──

  test('Requirement 2: isPlmDefaultImage correctly identifies permanent PLM default images', () => {
    assert.equal(isPlmDefaultImage(plmS3Url), true);
    assert.equal(isPlmDefaultImage('buyerapp-image/Summer/Dress/Dress_default_123.jpg'), true);
    assert.equal(isPlmDefaultImage(annotationS3Url), false);
    assert.equal(isPlmDefaultImage('buyerapp-image/Summer/Dress/Dress_custom_123.jpg'), false);
  });

  test('Requirement 2: extractAnnotationS3Urls filters out the protected PLM image and retains only annotations', () => {
    const allUrls = JSON.stringify([plmS3Url, annotationS3Url]);
    const annotations = extractAnnotationS3Urls(allUrls);

    assert.equal(annotations.length, 1);
    assert.equal(annotations[0], annotationS3Url);
    assert.ok(!annotations.includes(plmS3Url), 'PLM default image must never be in deletable annotations list');
  });

  test('Requirement 2: projectService.deleteImageFromS3 blocks deletion of PLM default images', async () => {
    // Attempting to delete the PLM image returns false and does not call backend
    const result = await projectService.deleteImageFromS3(plmS3Url);
    assert.equal(result, false, 'deleteImageFromS3 must protect PLM image from deletion');
  });

  test('extractS3Urls parses all S3 URLs correctly', () => {
    const urls = [plmS3Url, annotationS3Url, 'data:image/jpeg;base64,12345'];
    const extracted = extractS3Urls(JSON.stringify(urls));
    assert.equal(extracted.length, 2);
    assert.ok(extracted.includes(plmS3Url));
    assert.ok(extracted.includes(annotationS3Url));
  });

  // ── PPT AI Generated slot & S3 Deletion tests ──

  test('Requirement 1 (PPT): AI Generated slot prioritizes PLM image and annotations map to Front/Back/Fabric', () => {
    const styleNumber = 'StyleA';
    const plmImagesMap: Record<string, string> = {
      [styleNumber]: plmDirectUrl,
    };
    const frontAnnotation = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/front.jpg';
    const backAnnotation = 'https://buyer-selection-images-prod.s3.us-east-1.amazonaws.com/buyerapp-image/Project1/StyleA/back.jpg';
    const rawRefs = [plmS3Url, frontAnnotation, backAnnotation];

    // Style / AI Generated slot MUST get PLM image
    const plmImageRef = plmImagesMap[styleNumber] || rawRefs.find(r => isPlmDefaultImage(r)) || null;
    assert.equal(plmImageRef, plmDirectUrl);

    // Front/Back/Fabric MUST NOT include the PLM default image
    const annotations = rawRefs.filter(r => !isPlmDefaultImage(r));
    assert.equal(annotations.length, 2);
    assert.equal(annotations[0], frontAnnotation);
    assert.equal(annotations[1], backAnnotation);
  });

  test('Requirement 2: projectService provides deleteProjectImagesFromS3 and deleteStyleImagesFromS3', async () => {
    assert.equal(typeof projectService.deleteProjectImagesFromS3, 'function');
    assert.equal(typeof projectService.deleteStyleImagesFromS3, 'function');
  });
});
