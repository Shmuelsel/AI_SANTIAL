"""
Appearance feature extraction for person Re-ID.
Uses MobileNet V3 Small (ImageNet pre-trained) with the classification
head replaced by an identity layer, producing a 1024-dimensional
L2-normalised feature vector per crop.
"""
import cv2
import numpy as np
import torch
import torch.nn.functional as F
import torchvision.models as models
import torchvision.transforms as T
from PIL import Image
from typing import List

from shared import config


class FeatureExtractor:
    """
    Accepts a list of BGR numpy crop arrays and returns a list of
    normalised float feature vectors (one per crop).
    """

    def __init__(self):
        print("[INFO] FeatureExtractor: loading MobileNet V3 Small …")
        backbone = models.mobilenet_v3_small(
            weights=models.MobileNet_V3_Small_Weights.DEFAULT
        )
        # Drop the final classification layer — keep the 1024-d representation.
        backbone.classifier[3] = torch.nn.Identity()
        backbone.eval()
        self._model = backbone

        self._transform = T.Compose([
            T.Resize((config.FEATURE_INPUT_H, config.FEATURE_INPUT_W)),
            T.ToTensor(),
            T.Normalize(mean=config.IMAGENET_MEAN, std=config.IMAGENET_STD),
        ])
        print("[INFO] FeatureExtractor: ready.")

    def extract(self, crops: List[np.ndarray]) -> List[List[float]]:
        """
        Args:
            crops: BGR numpy arrays (person image crops from OpenCV).
        Returns:
            List of L2-normalised float lists, one per crop.
            Empty list if crops is empty.
        """
        if not crops:
            return []

        features = []
        with torch.no_grad():
            for crop in crops:
                pil = Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB))
                tensor = self._transform(pil).unsqueeze(0)
                feat   = self._model(tensor)
                feat   = F.normalize(feat, p=2, dim=1)
                features.append(feat[0].cpu().numpy().tolist())

        return features
