# Someshwari River Sand and Water Dynamics Analysis - Summary

This project uses Google Earth Engine to analyze seasonal variations in sand bar formations and water coverage along the Someshwari River over a 10-year period (2016-2025). The analysis leverages Sentinel-2 and Landsat satellite imagery to track environmental changes in this dynamic river system.

## Background
The Someshwari River experiences significant seasonal fluctuations in water levels and sand bar exposure, particularly during the dry season (November through April). Understanding these patterns is crucial for river morphology studies, water resource management, and environmental monitoring.

## Methodology
The project employs two spectral indices for feature extraction:
- **BSI (Bare Soil Index)**: Identifies exposed sand bars and bare soil surfaces
- **MNDWI (Modified Normalized Difference Water Index)**: Maps water body extent

The analysis processes cloud-filtered (<20% cloud cover) Sentinel-2 imagery at 10-meter resolution for 60 monthly periods spanning November 2016 to April 2026. For long-term historical context, a complementary Landsat analysis extends back to 1984.

## Key Features
The scripts automate the entire workflow from image acquisition to statistical analysis, generating:
- RGB composites and index visualizations for each time period
- Area calculations (km² and percentages) for sand and water coverage
- Month-to-month change detection within each season
- Year-over-year comparisons for same-month periods
- Exportable CSV datasets for further analysis

## Applications
This methodology can be applied to:
- Monitor river morphology changes over time
- Assess seasonal sand bar dynamics
- Support water resource planning and management
- Evaluate environmental impacts on river systems
- Study climate change effects on fluvial processes

## Deliverables
The repository includes ready-to-use JavaScript code for Google Earth Engine, documentation, and example outputs. Results are exported as structured CSV files containing comprehensive statistics suitable for scientific analysis, visualization, and reporting.
