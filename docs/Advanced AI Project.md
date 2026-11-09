Goal:

- Modify songs based on characteristics  
- How the music models work   
- How to evaluate results from the models

Diffusion-based models

We prompt to change music  
Predefined buttons

Focus first on 2-3 different styles of music

Web App

Risks

- Models are unable to maintain the melodic characteristics  
- Decomposition of music elements  
- Data collection

Planning

- Set roles per task  
- Define tasks  
- 

Literature Review  
Data Collection

- Investigate first [https\://www\.kaggle.com/datasets/imsparsh/musicnet-dataset/data](https://www.kaggle.com/datasets/imsparsh/musicnet-dataset/data)

[https\://www\.kaggle.com/datasets/kritanjalijain/music-midi-dataset](https://www.kaggle.com/datasets/kritanjalijain/music-midi-dataset)

- (if good enough using 2 genres, expand data range)

Processing

- 2 people per approach to check feasibility asap  
- Some people work on diffusion models while others try things we tried in class like transformers, autoencoders, VAE


Data Presentation

- Web app

Deliverables:

- literature review  
- Working model  
- Web application  
- Presentation

## Project Definition

A web application that takes an uploaded music file and with the user’s input it can change it to another music genre. 

Must have:

- Working models (autoencoder-style per genre; guided diffusion models)  
- Web interface that takes the given file and performs the transformation  
- Notebooks with model testing and evaluation  
- Transformation guided by prompt or a hard-coded style button

Potential things we can add (completely unnecessary for the project):

- Having a history of uploaded and new songs (filtering by genre etc.)  
- Sharing option for new generated songs (?)  
- Deleting songs from history  
- Access Role Management  
- Showcasing some songs on the main page?  
- Deployment  
- Testing  
- Monitoring 

## Timelines

| Phase | Time | Resources | Risks |
| :---- | :---- | :---- | :---- |
| Literature Review | 2 weeks | Existing solutions / literature | Existing solutions may be proven to require very large amount of computation to transfer the genre successfully; Potentially small amounts of existing literature |
| Topic Research | 1 week | All developers | Not fully understanding the topic before working might result in slower development or unexpected errors |
| Data Collection | 2 weeks | Data Engineer | Not enough data for the range of music we would like to do / not enough data for good results |
| Data Preparation | 1 week | Data Engineer | Working with mp3 files might require additional libraries or tools (music files will take more space) |
| Modelling | 3 weeks | At least 3 Data Scientists | If started late, training might take too much time; Split the model types to different people to speed up process |
| Evaluation | 2 weeks | At least 3 Data Scientists | Results are weak; Evaluation methods other than manual checks are unknown |
| Web Application Development \+ Presentation Creation | 2 weeks | 1 or 2 Software Engineers \+ Data Visualizer  | Not enough time to develop all features (including the nice to haves) |
| (Potentially) Deployment | 1 week | DevOps Engineer | Configuration issues |

## Gantt Chart

Local models:

- ACE-Step1.5 (diffusion transformer): input consists of source audio file, text style tags, optional lyrics, bpm, key, duration  
- Stable Audio 3  
- Stable Audio Open 1.0  
- RAVE (VAE)