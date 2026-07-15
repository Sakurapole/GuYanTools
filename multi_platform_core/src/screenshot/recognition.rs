use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ScreenshotUiBlockKind {
    Button,
    Input,
    Card,
    ListItem,
    Navigation,
    Image,
    Group,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRecognitionOptions {
    pub min_block_width: Option<u32>,
    pub min_block_height: Option<u32>,
    pub merge_gap: Option<u32>,
    pub max_blocks: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotRect {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotUiBlockFeatures {
    pub edge_density: f32,
    pub fill_ratio: f32,
    pub aspect_ratio: f32,
    pub horizontal_alignment_score: f32,
    pub repeated_sibling_score: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotUiBlock {
    pub id: String,
    pub kind: ScreenshotUiBlockKind,
    pub rect: ScreenshotRect,
    pub confidence: f32,
    pub parent_id: Option<String>,
    pub child_ids: Vec<String>,
    pub source: String,
    pub features: ScreenshotUiBlockFeatures,
}

#[derive(Debug, Clone)]
struct CandidateRect {
    rect: ScreenshotRect,
    color: [u8; 3],
}

pub fn recognize_ui_blocks_from_rgba(
    width: u32,
    height: u32,
    rgba: &[u8],
    options: ScreenshotRecognitionOptions,
) -> Vec<ScreenshotUiBlock> {
    if width == 0 || height == 0 || rgba.len() < (width * height * 4) as usize {
        return Vec::new();
    }

    let min_w = options.min_block_width.unwrap_or(16);
    let min_h = options.min_block_height.unwrap_or(12);
    let max_blocks = options.max_blocks.unwrap_or(128);
    let background = sample_background(width, height, rgba);
    let mut visited = vec![false; (width * height) as usize];
    let mut candidates = Vec::new();

    for y in 0..height {
        for x in 0..width {
            let index = (y * width + x) as usize;
            if visited[index] || is_background_like(width, rgba, x, y, background) {
                continue;
            }
            let candidate = flood_color_rect(width, height, rgba, &mut visited, x, y, background);
            if candidate.rect.width >= min_w && candidate.rect.height >= min_h {
                candidates.push(candidate);
            }
        }
    }

    score_repeated_siblings(
        width,
        height,
        candidates
            .into_iter()
            .map(|candidate| {
                let features = features_for_rect(width, rgba, &candidate.rect, candidate.color);
                let kind = classify_rect(width, height, &candidate.rect, &features, candidate.color);
                (candidate, features, kind)
            })
            .collect(),
    )
    .into_iter()
    .take(max_blocks)
    .enumerate()
    .map(|(index, (candidate, features, kind))| ScreenshotUiBlock {
        id: format!("block-{}", index + 1),
        kind,
        rect: candidate.rect,
        confidence: confidence_for_features(&features),
        parent_id: None,
        child_ids: Vec::new(),
        source: "local-heuristic".to_string(),
        features,
    })
    .collect()
}

fn score_repeated_siblings(
    _width: u32,
    _height: u32,
    mut entries: Vec<(CandidateRect, ScreenshotUiBlockFeatures, ScreenshotUiBlockKind)>,
) -> Vec<(CandidateRect, ScreenshotUiBlockFeatures, ScreenshotUiBlockKind)> {
    for index in 0..entries.len() {
        let rect = &entries[index].0.rect;
        let similar_rows = entries
            .iter()
            .filter(|(candidate, _, _)| {
                candidate.rect.x.abs_diff(rect.x) <= 8
                    && candidate.rect.width.abs_diff(rect.width) <= 12
                    && candidate.rect.height.abs_diff(rect.height) <= 8
                    && candidate.rect.y != rect.y
            })
            .count();
        if similar_rows >= 1 {
            entries[index].1.repeated_sibling_score = 0.9;
            if !matches!(
                entries[index].2,
                ScreenshotUiBlockKind::Navigation | ScreenshotUiBlockKind::Card | ScreenshotUiBlockKind::Button
            ) {
                entries[index].2 = ScreenshotUiBlockKind::ListItem;
            }
        }
    }

    entries.sort_by_key(|(candidate, _, _)| (candidate.rect.y, candidate.rect.x));
    entries
}

fn sample_background(width: u32, height: u32, rgba: &[u8]) -> [u8; 3] {
    let points = [
        (0, 0),
        (width.saturating_sub(1), 0),
        (0, height.saturating_sub(1)),
        (width.saturating_sub(1), height.saturating_sub(1)),
    ];
    let mut sum = [0u32; 3];
    for (x, y) in points {
        let color = pixel_rgb(width, rgba, x, y);
        sum[0] += color[0] as u32;
        sum[1] += color[1] as u32;
        sum[2] += color[2] as u32;
    }
    [(sum[0] / 4) as u8, (sum[1] / 4) as u8, (sum[2] / 4) as u8]
}

fn is_background_like(width: u32, rgba: &[u8], x: u32, y: u32, background: [u8; 3]) -> bool {
    let offset = ((y * width + x) * 4) as usize;
    rgba[offset + 3] < 24 || color_distance(pixel_rgb(width, rgba, x, y), background) <= 6
}

fn flood_color_rect(
    width: u32,
    height: u32,
    rgba: &[u8],
    visited: &mut [bool],
    start_x: u32,
    start_y: u32,
    background: [u8; 3],
) -> CandidateRect {
    let seed = pixel_rgb(width, rgba, start_x, start_y);
    let mut stack = vec![(start_x, start_y)];
    let mut left = start_x;
    let mut right = start_x;
    let mut top = start_y;
    let mut bottom = start_y;

    while let Some((x, y)) = stack.pop() {
        if x >= width || y >= height {
            continue;
        }
        let index = (y * width + x) as usize;
        if visited[index]
            || is_background_like(width, rgba, x, y, background)
            || color_distance(pixel_rgb(width, rgba, x, y), seed) > 12
        {
            continue;
        }
        visited[index] = true;
        left = left.min(x);
        right = right.max(x);
        top = top.min(y);
        bottom = bottom.max(y);
        if x > 0 {
            stack.push((x - 1, y));
        }
        if x + 1 < width {
            stack.push((x + 1, y));
        }
        if y > 0 {
            stack.push((x, y - 1));
        }
        if y + 1 < height {
            stack.push((x, y + 1));
        }
    }

    CandidateRect {
        rect: ScreenshotRect {
            x: left,
            y: top,
            width: right.saturating_sub(left) + 1,
            height: bottom.saturating_sub(top) + 1,
        },
        color: seed,
    }
}

fn features_for_rect(
    width: u32,
    rgba: &[u8],
    rect: &ScreenshotRect,
    color: [u8; 3],
) -> ScreenshotUiBlockFeatures {
    let aspect_ratio = rect.width as f32 / rect.height.max(1) as f32;
    ScreenshotUiBlockFeatures {
        edge_density: edge_density(width, rgba, rect),
        fill_ratio: similar_fill_ratio(width, rgba, rect, color),
        aspect_ratio,
        horizontal_alignment_score: if rect.width > rect.height * 3 { 0.85 } else { 0.35 },
        repeated_sibling_score: 0.0,
    }
}

fn classify_rect(
    image_width: u32,
    image_height: u32,
    rect: &ScreenshotRect,
    features: &ScreenshotUiBlockFeatures,
    color: [u8; 3],
) -> ScreenshotUiBlockKind {
    if rect.y <= 4 && rect.width > image_width * 8 / 10 && rect.height <= image_height / 4 {
        return ScreenshotUiBlockKind::Navigation;
    }
    if rect.width > image_width / 2 && rect.height > image_height / 3 {
        return ScreenshotUiBlockKind::Card;
    }
    if features.repeated_sibling_score > 0.7 {
        return ScreenshotUiBlockKind::ListItem;
    }
    if features.aspect_ratio >= 2.3 && rect.height <= 42 && rect.width >= 64 {
        if is_blue_or_accent(color) {
            return ScreenshotUiBlockKind::Button;
        }
        return ScreenshotUiBlockKind::Input;
    }
    if features.aspect_ratio >= 5.0 && rect.height <= 36 {
        return ScreenshotUiBlockKind::ListItem;
    }
    ScreenshotUiBlockKind::Unknown
}

fn similar_fill_ratio(width: u32, rgba: &[u8], rect: &ScreenshotRect, color: [u8; 3]) -> f32 {
    let mut filled = 0u32;
    let mut total = 0u32;
    for y in rect.y..rect.y + rect.height {
        for x in rect.x..rect.x + rect.width {
            total += 1;
            if color_distance(pixel_rgb(width, rgba, x, y), color) <= 12 {
                filled += 1;
            }
        }
    }
    filled as f32 / total.max(1) as f32
}

fn edge_density(width: u32, rgba: &[u8], rect: &ScreenshotRect) -> f32 {
    if rect.width < 3 || rect.height < 3 {
        return 0.0;
    }
    let mut edges = 0u32;
    let mut total = 0u32;
    for y in rect.y + 1..rect.y + rect.height - 1 {
        for x in rect.x + 1..rect.x + rect.width - 1 {
            total += 1;
            let current = luminance(width, rgba, x, y);
            let right = luminance(width, rgba, x + 1, y);
            let down = luminance(width, rgba, x, y + 1);
            if (current - right).abs() + (current - down).abs() > 30.0 {
                edges += 1;
            }
        }
    }
    edges as f32 / total.max(1) as f32
}

fn confidence_for_features(features: &ScreenshotUiBlockFeatures) -> f32 {
    (0.45 + features.fill_ratio.min(1.0) * 0.35 + features.edge_density.min(1.0) * 0.2)
        .clamp(0.0, 0.98)
}

fn luminance(width: u32, rgba: &[u8], x: u32, y: u32) -> f32 {
    let color = pixel_rgb(width, rgba, x, y);
    color[0] as f32 * 0.2126 + color[1] as f32 * 0.7152 + color[2] as f32 * 0.0722
}

fn pixel_rgb(width: u32, rgba: &[u8], x: u32, y: u32) -> [u8; 3] {
    let offset = ((y * width + x) * 4) as usize;
    [rgba[offset], rgba[offset + 1], rgba[offset + 2]]
}

fn color_distance(a: [u8; 3], b: [u8; 3]) -> u16 {
    let dr = a[0].abs_diff(b[0]) as u16;
    let dg = a[1].abs_diff(b[1]) as u16;
    let db = a[2].abs_diff(b[2]) as u16;
    dr + dg + db
}

fn is_blue_or_accent(color: [u8; 3]) -> bool {
    color[2] > color[0].saturating_add(30) || color[1] > color[0].saturating_add(45)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn set_rect(rgba: &mut [u8], width: u32, rect: ScreenshotRect, color: [u8; 4]) {
        for y in rect.y..rect.y + rect.height {
            for x in rect.x..rect.x + rect.width {
                let offset = ((y * width + x) * 4) as usize;
                rgba[offset..offset + 4].copy_from_slice(&color);
            }
        }
    }

    #[test]
    fn detects_buttons_inputs_cards_lists_and_navigation() {
        let width = 360;
        let height = 220;
        let mut rgba = vec![245u8; (width * height * 4) as usize];
        for pixel in rgba.chunks_exact_mut(4) {
            pixel.copy_from_slice(&[245, 247, 250, 255]);
        }

        set_rect(&mut rgba, width, ScreenshotRect { x: 0, y: 0, width: 360, height: 44 }, [32, 42, 58, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 24, y: 66, width: 312, height: 124 }, [255, 255, 255, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 88, width: 170, height: 28 }, [248, 250, 252, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 230, y: 88, width: 82, height: 28 }, [37, 99, 235, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 132, width: 268, height: 24 }, [241, 245, 249, 255]);
        set_rect(&mut rgba, width, ScreenshotRect { x: 44, y: 160, width: 268, height: 24 }, [241, 245, 249, 255]);

        let blocks = recognize_ui_blocks_from_rgba(width, height, &rgba, ScreenshotRecognitionOptions {
            min_block_width: Some(12),
            min_block_height: Some(10),
            merge_gap: Some(6),
            max_blocks: Some(64),
        });

        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Navigation));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Card));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Input));
        assert!(blocks.iter().any(|block| block.kind == ScreenshotUiBlockKind::Button));
        assert!(blocks.iter().filter(|block| block.kind == ScreenshotUiBlockKind::ListItem).count() >= 2);
    }
}
