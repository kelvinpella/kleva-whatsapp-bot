/**
 * Similarity Calculator
 * Calculates similarity between image embeddings for search
 */

/**
 * Calculate Hamming distance between two hex strings
 * Lower distance = more similar
 */
function hammingDistance(hash1, hash2) {
  if (!hash1 || !hash2 || hash1.length !== hash2.length) {
    return Infinity;
  }

  let distance = 0;
  for (let i = 0; i < hash1.length; i++) {
    if (hash1[i] !== hash2[i]) {
      distance++;
    }
  }
  return distance;
}

/**
 * Convert Hamming distance to similarity score (0-1)
 * 1 = identical, 0 = completely different
 */
function distanceToSimilarity(distance, maxDistance = 256) {
  return Math.max(0, 1 - distance / maxDistance);
}

/**
 * Cosine similarity between two vectors
 */
function cosineSimilarity(vec1, vec2) {
  if (!vec1 || !vec2 || vec1.length !== vec2.length) {
    return 0;
  }

  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    magnitude1 += vec1[i] * vec1[i];
    magnitude2 += vec2[i] * vec2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Calculate similarity between two hash embeddings
 */
function calculateHashSimilarity(hash1, hash2) {
  const distance = hammingDistance(hash1, hash2);
  return distanceToSimilarity(distance);
}

/**
 * Compare image with database products
 */
function findSimilarProducts(searchEmbedding, products, minSimilarity = 0.7) {
  const results = [];

  for (const product of products) {
    const similarity = calculateHashSimilarity(searchEmbedding, product.embedding_hash);

    if (similarity >= minSimilarity) {
      results.push({
        ...product,
        similarity: parseFloat(similarity.toFixed(2))
      });
    }
  }

  // Sort by similarity descending
  results.sort((a, b) => b.similarity - a.similarity);

  return results;
}

module.exports = {
  hammingDistance,
  distanceToSimilarity,
  cosineSimilarity,
  calculateHashSimilarity,
  findSimilarProducts
};
