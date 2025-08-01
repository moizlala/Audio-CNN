from pathlib import Path
import sys
import numpy as np
import pandas as pd

import modal
import torch
from torch.utils.data import Dataset , DataLoader
import torchaudio.transforms as T
import torch.nn as nn
import torch.optim as optim
import torch.optim.lr_scheduler as OneCycleLR

import torchaudio
from tqdm import tqdm
from torch.utils.tensorboard import SummaryWriter

from model import AudioCNN

app = modal.App("audio-cnn")

image = (modal.Image.debian_slim().pip_install_from_requirements("requirements.txt").apt_install(["wget","unzip","ffmpeg", "libsndfile1"])
         .run_commands([
             "cd /tmp && wget https://github.com/karolpiczak/ESC-50/archive/master.zip -O esc50.zip",
                "cd /tmp && unzip esc50.zip",
                "mkdir -p /opt/esc50-data",
                "cp -r /tmp/ESC-50-master/* /opt/esc50-data/",
                "rm -rf tmp/esc50.zip /tmp/ESC-50-master",
         ])
         .add_local_python_source("model"))

volume =modal.Volume.from_name("esc50-data", create_if_missing=True)
model_volume =modal.Volume.from_name("esc-model", create_if_missing=True)

class ESC50Dataset(Dataset):
    def __init__(self, data_dir, metadata_file, split='train',transform=None):
       super().__init__()
       self.data_dir = Path(data_dir)
       self.metadata = pd.read_csv(metadata_file)
       self.split = split
       self.transform = transform

       if split == 'train':
           self.metadata = self.metadata[self.metadata['fold'] != 5]
       else: 
           self.metadata = self.metadata[self.metadata['fold'] == 5]

       self.classes = sorted(self.metadata['category'].unique())
       self.class_to_idx = {cls: idx for idx, cls in enumerate(self.classes)}
       self.metadata['label'] = self.metadata['category'].map(self.class_to_idx)

    def __len__(self):
        return len(self.metadata)
    
    def __getitem__(self, idx):
        row = self.metadata.iloc[idx]
        audio_path = self.data_dir / 'audio' / row['filename']
        
        waveform , sample_rate =torchaudio.load(audio_path)

        if waveform.shape[0] > 1:
            waveform = torch.mean( waveform ,dim=0, keepdim=True)
        
        if self.transform:
            spectrogram = self.transform(waveform)
        else:
            spectrogram = waveform
        
        return spectrogram, row['label']
    

def mixup_data(x,y):
    lam = np.random.beta(0.2, 0.2)
    batch_size = x.size(0)
    index = torch.randperm(batch_size).to(x.device)
    mixed_x = lam * x + (1 - lam) * x[index, :]
    y_a, y_b = y, y[index]
    return mixed_x, y_a, y_b, lam

def mixup_criterion(criterion, pred, y_a, y_b, lam):
    return lam * criterion(pred, y_a) + (1 - lam) * criterion(pred, y_b)

@app.function(image=image , gpu="A10G", volumes={"/data": volume, "/models": model_volume},timeout=60*60*3)
def train():
   from datetime import datetime
   timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
   log_dir  = f'/models/tensorboard-logs/run_{timestamp}' 
   writer = SummaryWriter(log_dir)


   esc50_dir = Path("/opt/esc50-data")

   train_transform = nn.Sequential(
       T.MelSpectrogram(
              sample_rate=44100,
              n_fft=1024,
              hop_length=512,
              n_mels=128,
              f_min=0,
              f_max=11025,
              
       ),
       T.AmplitudeToDB(),
       T.FrequencyMasking(freq_mask_param=30),
       T.TimeMasking(time_mask_param=80),
   )

   val_transform = nn.Sequential(
       T.MelSpectrogram(
              sample_rate=44100,
              n_fft=1024,
              hop_length=512,
              n_mels=128,
              f_min=0,
              f_max=11025,
              
       ),
       T.AmplitudeToDB(),

   )
   train_dataset = ESC50Dataset(
       data_dir=esc50_dir,
       metadata_file=esc50_dir / 'meta'/'esc50.csv',
       split='train',
       transform=train_transform
   )
   val_dataset = ESC50Dataset(
         data_dir=esc50_dir,
         metadata_file=esc50_dir / 'meta'/'esc50.csv',
         split='test',
         transform=val_transform
    )
   print(f"Train dataset size: {len(train_dataset)}")
   print(f"Validation dataset size: {len(val_dataset)}")
   
   train_dataloader = DataLoader(train_dataset, batch_size=32, shuffle=True)
   test_dataloader = DataLoader(val_dataset, batch_size=32, shuffle=False)

   device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
   model = AudioCNN(num_classes=len(train_dataset.classes))
   model.to(device)

   num_epochs = 100
   criterion = nn.CrossEntropyLoss(label_smoothing=0.1)
   optimzer = optim.Adam(model.parameters(), lr=0.005, weight_decay=0.01)

   scheduler = OneCycleLR.OneCycleLR(
        optimzer, 
        max_lr=0.002, 
        steps_per_epoch=len(train_dataloader), 
        epochs=num_epochs,
        pct_start=0.1
    )
   best_accuracy = 0.0

   print("Starting training...")
   for epoch in range(num_epochs):
       model.train()
       epoch_loss = 0.0

       progress_bar = tqdm(train_dataloader, desc=f"Epoch {epoch+1}/{num_epochs}") 
       for data,target in progress_bar:
           data,target = data.to(device), target.to(device)


           if np.random.random()> 0.7:
               data, target_a, target_b, lam = mixup_data(data, target)
               output = model(data)
               loss = mixup_criterion(criterion, output, target_a, target_b, lam)
           else:
                output = model(data)
                loss = criterion(output, target)

           optimzer.zero_grad()
           loss.backward()
           optimzer.step()
           scheduler.step()

           epoch_loss += loss.item()
           progress_bar.set_postfix({'loss': f"{loss.item():.4f}"})
       avg_epoch_loss = epoch_loss / len(train_dataloader)
       writer.add_scalar('Loss/Train', avg_epoch_loss, epoch)
       writer.add_scalar('learning_rate', optimzer.param_groups[0]['lr'], epoch)

       model.eval()
       correct = 0
       total= 0
       val_loss = 0

       with torch.no_grad():
              for data, target in test_dataloader:
                data, target = data.to(device), target.to(device)
                output = model(data)
                loss = criterion(output, target)
                val_loss += loss.item()
    
                _, predicted = torch.max(output.data, 1)
                total += target.size(0)
                correct += (predicted == target).sum().item()
       accuracy= 100 * correct / total
       avg_val_loss = val_loss / len(test_dataloader)
       writer.add_scalar('Loss/Validation', avg_val_loss, epoch)
       writer.add_scalar('Accuracy/Validation', accuracy, epoch)

       print(f"Epoch {epoch+1}/{num_epochs}, Loss: {avg_epoch_loss:.4f}, Val Loss: {avg_val_loss:.4f}, Accuracy: {accuracy:.2f}%")

       if accuracy > best_accuracy:
           best_accuracy = accuracy
           torch.save({
                'model_state_dict': model.state_dict(),
                'epoch': epoch,
                'accuracy': accuracy,
                'classes': train_dataset.classes
              },   '/models/best_model.pth' 
              )
           print("New best Model saved; {accuracy:.2f}%")
   writer.close()
   print("Training complete. Best accuracy: {best_accuracy:.2f}%")
           



@app.local_entrypoint()
def main():
   train.remote()
    


    

